const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require("@aws-sdk/client-transcribe-streaming");
const { PassThrough } = require("stream");
const mic = require("mic");
const { Writable } = require("stream");
const WebSocket = require('ws');
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Pre-flight requests
app.options('*', cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Google Gemini AI
let genAI;
try {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Google API key is missing in environment variables");
  }
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
} catch (error) {
  console.error("Failed to initialize Google Generative AI:", error.message);
  process.exit(1);
}

// Initialize AWS Transcribe
let transcribeClient;
try {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials are missing in environment variables");
  }
  
  transcribeClient = new TranscribeStreamingClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
} catch (error) {
  console.error("Failed to initialize AWS Transcribe:", error.message);
}

// Configure file uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Process content with Gemini AI
async function processWithGemini(prompt, imagePath = null, isText = false) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
    
    if (isText) {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } else {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");
      
      const imageData = {
        inlineData: {
          data: base64Image,
          mimeType: "image/png",
        },
      };

      const result = await model.generateContent([prompt, imageData]);
      return result.response.text();
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(`Gemini processing failed: ${error.message}`);
  }
}

// Transcription state management
let activeTranscription = {
  stream: null,
  micInstance: null,
  transcription: '',
  isActive: false
};

// Transcribe audio with AWS - Real-time streaming version
async function startTranscriptionStream() {
  return new Promise(async (resolve, reject) => {
    if (!transcribeClient) {
      return reject(new Error("AWS Transcribe client not initialized"));
    }

    // Audio configuration
    const sampleRate = 32000;
    const channels = 1;
    const bitwidth = 16;
    const chunkDuration = 100; // 100ms chunks
    const chunkSize = (sampleRate * chunkDuration * bitwidth) / (8 * 1000); // 6400 bytes

    // Create microphone instance
    const micInstance = mic({
      rate: 16000,
      channels: channels,
      bitwidth: bitwidth,
      debug: true,
      exitOnSilence: 6,
      fileType: 'wav'
    });

    const micInputStream = micInstance.getAudioStream();
    const audioStream = new PassThrough();

    // Pipe microphone to our stream
    micInputStream.pipe(audioStream);

    const params = {
      LanguageCode: 'en-GB',
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: sampleRate,
      AudioStream: (async function* () {
        try {
          for await (const chunk of audioStream) {
            yield { AudioEvent: { AudioChunk: chunk } };
          }
          // Signal end of stream
          yield { AudioEvent: { AudioChunk: Buffer.alloc(0) } };
        } catch (error) {
          console.error("Error in audio stream generator:", error);
          throw error;
        }
      })(),
    };

    try {
      console.log("Starting real-time transcription...");
      const command = new StartStreamTranscriptionCommand(params);
      const response = await transcribeClient.send(command);

      // Start microphone
      micInstance.start();
      console.log("Microphone started");

      // Set up transcription state
      activeTranscription = {
        stream: response.TranscriptResultStream,
        micInstance,
        transcription: '',
        isActive: true
      };

      // Process results in background
      processTranscriptionResults();

      resolve({
        status: "started",
        message: "Transcription stream started successfully"
      });
    } catch (error) {
      console.error("Transcription error:", error);
      micInstance.stop();
      reject(new Error(`Transcription failed: ${error.message}`));
    }
  });
}

async function processTranscriptionResults() {
  try {
    for await (const event of activeTranscription.stream) {
      if (event.TranscriptEvent) {
        const results = event.TranscriptEvent.Transcript.Results;
        if (results && results.length > 0 && !results[0].IsPartial) {
          const transcript = results[0].Alternatives[0].Transcript;
          activeTranscription.transcription += transcript + ' ';
          console.log("New transcription:", transcript);
          
          // Broadcast to WebSocket clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "transcription_update",
                data: transcript
              }));
            }
          });
        }
      }
    }
  } catch (error) {
    console.error("Error processing transcription stream:", error);
  } finally {
    stopTranscription();
  }
}

function stopTranscription() {
  if (activeTranscription.isActive) {
    if (activeTranscription.micInstance) {
      activeTranscription.micInstance.stop();
    }
    activeTranscription.isActive = false;
    console.log("Transcription stopped");
  }
  return activeTranscription.transcription;
}

// WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  
  ws.on('message', (message) => {
    console.log('Received message:', message.toString());
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// API Routes
const router = express.Router();

router.post("/image-to-code", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const prompt = req.body.prompt || "Convert this UI image into pixel-perfect, clean, responsive HTML and CSS. Match the layout, spacing, and styles exactly as shown in the image. Output only the code without any extra text. Format: first full HTML, then CSS in a <style> tag below.";
    const code = await processWithGemini(prompt, req.file.path);
    
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Error deleting image:", err);
    });
    
    res.json({ code });
  } catch (error) {
    next(error);
  }
});

router.post("/sketch-to-code", upload.single("sketch"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No sketch file uploaded" });
    }

    const prompt = req.body.prompt || "Convert this Hand Drawn UI sketch into, clean, responsive HTML and CSS. Match the layout, spacing, and styles exactly as shown in the image. Output only the code without any extra text. Format: first full HTML, then CSS in a <style> tag below.";
    const code = await processWithGemini(prompt, req.file.path);
    
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Error deleting sketch:", err);
    });
    
    res.json({ code });
  } catch (error) {
    next(error);
  }
});

router.post("/text-to-code", async (req, res, next) => {
  try {
    const { text, prompt = "Convert this Description into perfect, clean, responsive HTML and CSS. Match the layout, spacing, and styles exactly as said in the text. Output only the code without any extra text. Format: first full HTML, then CSS in a <style> tag below." } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Text input is required" });
    }

    const fullPrompt = `${prompt}\n\n${text}`;
    const code = await processWithGemini(fullPrompt, null, true);
    
    res.json({ code });
  } catch (error) {
    next(error);
  }
});

router.post("/voice-to-code", upload.single("audio"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const transcription = await transcribeAudio(req.file.path);
    const prompt = req.body.prompt || "Convert this Description into perfect, clean, responsive HTML and CSS. Match the layout, spacing, and styles exactly as said in the text. Output only the code without any extra text. Format: first full HTML, then CSS in a <style> tag below";
    const fullPrompt = `${prompt}\n\n${transcription}`;
    const code = await processWithGemini(fullPrompt, null, true);

    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Error deleting audio:", err);
    });

    res.json({ transcription, code });
  } catch (error) {
    next(error);
  }
});

router.post("/start-transcription", async (req, res, next) => {
  try {
    if (activeTranscription.isActive) {
      return res.status(400).json({ error: "Transcription already in progress" });
    }

    const result = await startTranscriptionStream();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/stop-transcription", async (req, res, next) => {
  try {
    if (!activeTranscription.isActive) {
      return res.status(400).json({ error: "No active transcription session" });
    }

    const transcription = stopTranscription();
    res.json({ 
      status: "completed",
      transcription
    });
  } catch (error) {
    next(error);
  }
});

router.get("/transcription-status", async (req, res) => {
  res.json({
    isActive: activeTranscription.isActive,
    transcription: activeTranscription.transcription
  });
});

router.get("/test-connection", (req, res) => {
  res.json({ 
    status: "success", 
    message: "Backend is connected!",
    services: {
      google: !!genAI,
      aws: !!transcribeClient
    }
  });
});

// Mount the API router
app.use("/api", router);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ 
    error: "Internal Server Error",
    message: err.message || "Something went wrong"
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log("Available endpoints:");
  console.log(`- POST /api/image-to-code`);
  console.log(`- POST /api/sketch-to-code`);
  console.log(`- POST /api/text-to-code`);
  console.log(`- POST /api/voice-to-code`);
  console.log(`- POST /api/start-transcription`);
  console.log(`- POST /api/stop-transcription`);
  console.log(`- GET /api/transcription-status`);
  console.log(`- GET /api/test-connection`);
});

// Upgrade HTTP server to support WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
  console.log("Shutting down server...");
  stopTranscription();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});