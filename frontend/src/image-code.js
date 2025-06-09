import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useReactMediaRecorder } from 'react-media-recorder';

const api = axios.create({
  baseURL: 'http://localhost:5000/api'
});

const DesignToCode = () => {
  // State variables
  const [activeTab, setActiveTab] = useState('image');
  const [image, setImage] = useState(null);
  const [sketch, setSketch] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [code, setCode] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [uiPreview, setUiPreview] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState('Convert this into clean, responsive HTML and CSS code:');
  const [isDrawing, setIsDrawing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Testing connection...');
  const [error, setError] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [realTimeTranscript, setRealTimeTranscript] = useState('');
  const [transcriptionSocket, setTranscriptionSocket] = useState(null);
  const [darkMode, setDarkMode] = useState(false); // Default to dark mode
  const [fullScreenPreview, setFullScreenPreview] = useState(false);
  
  // Refs
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const sketchInputRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const codeContainerRef = useRef(null);
  const isStoppingRef = useRef(false); 
  
  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Toggle full screen preview
  const toggleFullScreenPreview = () => {
    setFullScreenPreview(!fullScreenPreview);
  };

  // WebSocket setup for real-time transcription
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5000');
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setTranscriptionSocket(ws);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'transcription_update' && data.data) {
        setRealTimeTranscript(prev => prev + ' ' + data.data);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setTranscriptionSocket(null);
    };
    
    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (canvasRef.current && activeTab === 'sketch') {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = darkMode ? '#000000' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [activeTab, darkMode]);

  // Audio recording with timer
const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl } = useReactMediaRecorder({ 
  audio: true
  // Removed the onStop prop since we're not using it
});

  // Recording timer effect
  useEffect(() => {
    if (status === 'recording') {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingTime(0);
    }

    return () => clearInterval(recordingTimerRef.current);
  }, [status]);

  // Extract code from response
  const extractCode = (rawCode) => {
    try {
      let cleanedCode = rawCode;
      if (rawCode.includes('```html')) {
        cleanedCode = rawCode.replace(/```html|```/g, '').trim();
      } else if (rawCode.includes('```')) {
        cleanedCode = rawCode.replace(/```/g, '').trim();
      }

      const htmlMatch = cleanedCode.match(/<[^>]+>[\s\S]*<\/[^>]+>/);
      const cssMatch = cleanedCode.match(/[^{}]+\s*\{[^}]*\}/g);
      
      setHtmlCode(htmlMatch ? htmlMatch[0] : '');
      setCssCode(cssMatch ? `<style>${cssMatch.join(' ')}</style>` : '');
      setCode(cleanedCode);
      setActiveTab('code');
      setError(null);
      
      // Scroll to code container
      setTimeout(() => {
        if (codeContainerRef.current) {
          codeContainerRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } catch (error) {
      console.error('Error extracting code:', error);
      setError('Error processing the generated code');
    }
  };

  const handleStartRecording = async () => {
    try {
      // Clear any previous transcript
      setRealTimeTranscript('');
      isStoppingRef.current = false; // Reset stopping flag
      
      // Start the recording
      startRecording();
      setIsTranscribing(true);
      
      // Start the transcription stream
      await api.post('/start-transcription');
    } catch (error) {
      console.error('Error starting transcription:', error);
      setError('Failed to start transcription');
      stopRecording();
      setIsTranscribing(false);
    }
  };

  const handleStopRecording = async () => {
    if (isStoppingRef.current) return;
    
    isStoppingRef.current = true;
    setIsTranscribing(false);
    
    try {
      stopRecording();
      
      const response = await api.post('/stop-transcription');
      const transcription = response.data.transcription;
      
      if (transcription) {
        // Set the transcription as text input
        setTextInput(transcription);
        // Also update the real-time transcript
        setRealTimeTranscript(transcription);
        // Switch to text tab to show the input
        setActiveTab("text");
        
        const fullPrompt = `${prompt}\n\n${transcription}`;
        const code = await processWithGemini(fullPrompt, null, true);
        extractCode(code);
      }
    } catch (error) {
      console.error('Error stopping transcription:', error);
      setError('Failed to complete transcription');
    } finally {
      isStoppingRef.current = false;
    }
  };
  // Process content with Gemini AI
  const processWithGemini = async (prompt, imagePath = null, isText = false) => {
    try {
      setIsLoading(true);
      let response;
      
      if (isText) {
        response = await api.post("/text-to-code", {
          prompt: prompt,
          text: prompt // Using the prompt as text since we're processing transcription
        });
      } else {
        const formData = new FormData();
        formData.append("image", imagePath);
        formData.append("prompt", prompt);
        response = await api.post("/image-to-code", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      if (response.data && response.data.code) {
        return response.data.code;
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Error generating code:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Test backend connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        const response = await api.get('/test-connection');
        if (response.data && response.data.status === 'success') {
          setConnectionStatus('Connected to backend');
        } else {
          setConnectionStatus('Backend response invalid');
        }
      } catch (error) {
        console.error('Connection test failed:', error);
        setConnectionStatus('Connection failed - check backend');
      }
    };
    testConnection();
  }, []);

  const generateCode = async () => {
    try {
      setIsLoading(true);
      setError(null);
      let response;

      if (activeTab === "image" && image) {
        const formData = new FormData();
        formData.append("image", image);
        formData.append("prompt", prompt);
        response = await api.post("/image-to-code", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else if (activeTab === "text" && textInput) {
        response = await api.post("/text-to-code", {
          prompt: prompt,
          text: textInput,
        });
      } else if (activeTab === "sketch" && sketch) {
        const formData = new FormData();
        formData.append("sketch", sketch);
        formData.append("prompt", prompt);
        response = await api.post("/sketch-to-code", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        setError("Please provide input first");
        setIsLoading(false);
        return;
      }

      if (response.data && response.data.code) {
        extractCode(response.data.code);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Error generating code:", error);
      setError(
        error.response?.data?.error ||
          error.message ||
          "Failed to generate code"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Render UI preview
  const renderUI = () => {
    if (!htmlCode && !cssCode) {
      setError("No code generated yet");
      return;
    }

    const modifiedCode = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        a, button, input {
          pointer-events: none;
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
      </style>
      ${cssCode}
    </head>
    <body>
      ${htmlCode}
    </body>
    </html>
  `;
  setUiPreview(modifiedCode);
  setActiveTab("preview");
};

// Copy to clipboard
const copyToClipboard = () => {
  if (!code) {
    setError("No code to copy");
    return;
  }
  navigator.clipboard
    .writeText(code)
    .then(() => alert("Code copied to clipboard!"))
    .catch((err) => {
      console.error("Failed to copy:", err);
      setError("Failed to copy code to clipboard");
    });
};

// Handle image upload
const handleImageUpload = (e) => {
  // Prevent double trigger
  if (!e.target.files || e.target.files.length === 0) return;
  
  const file = e.target.files[0];
  if (file) {
    if (!file.type.match("image.*")) {
      setError("Please select an image file");
      return;
    }
    setImage(file);
    setActiveTab("image");
    setError(null);
    // Reset the input value to allow selecting the same file again
    e.target.value = '';
  }
};

// Handle sketch upload
const handleSketchUpload = (e) => {
  if (!e.target.files || e.target.files.length === 0) return;
  
  const file = e.target.files[0];
  if (file) {
    if (!file.type.match("image.*")) {
      setError("Please select an image file");
      return;
    }
    setSketch(file);
    setActiveTab("sketch");
    setError(null);
    e.target.value = '';
  }
};

// Handle drawing on canvas
const startDrawing = (e) => {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = darkMode ? "#ffffff" : "#000000";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(
    e.nativeEvent.offsetX * (canvas.width / canvas.clientWidth),
    e.nativeEvent.offsetY * (canvas.height / canvas.clientHeight)
  );
  setIsDrawing(true);
};

const draw = (e) => {
  if (!isDrawing) return;
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  ctx.lineTo(
    e.nativeEvent.offsetX * (canvas.width / canvas.clientWidth),
    e.nativeEvent.offsetY * (canvas.height / canvas.clientHeight)
  );
  ctx.stroke();
};

const stopDrawing = () => {
  if (!isDrawing) return;
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  ctx.closePath();
  setIsDrawing(false);
};

const clearCanvas = () => {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = darkMode ? "#000000" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  setSketch(null);
};

const saveSketch = () => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  canvas.toBlob((blob) => {
    if (blob) {
      setSketch(new File([blob], "sketch.png", { type: "image/png" }));
      setError(null);
    }
  }, "image/png");
};

// Theme classes
const bgColor = darkMode ? 'bg-black' : 'bg-gray-50';
const cardBg = darkMode ? 'bg-gray-900' : 'bg-white';
const cardBorder = darkMode ? 'border-gray-800' : 'border-gray-200';
const textColor = darkMode ? 'text-white' : 'text-gray-900';
const textSecondary = darkMode ? 'text-gray-400' : 'text-gray-600';
const buttonPrimary = darkMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-700';
const canvasBg = darkMode ? 'bg-gray-900' : 'bg-white';
const canvasBorder = darkMode ? 'border-gray-800' : 'border-gray-200';
const inputBg = darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900';
const previewBg = darkMode ? 'bg-black' : 'bg-gray-50';
const codeBg = darkMode ? 'bg-gray-900' : 'bg-white';
const shadow = darkMode ? 'shadow-lg shadow-gray-900/50' : 'shadow-lg shadow-gray-400/20';
const borderWidth = 'border';
const navBarWidth = 'w-auto';

return (
  <div className={`min-h-screen ${bgColor} p-4 md:p-8 font-sans transition-colors duration-300 ${fullScreenPreview ? 'overflow-hidden' : ''}`}>
    {/* Dark mode toggle */}
    <button
      onClick={toggleDarkMode}
      className={`fixed top-4 right-4 z-50 p-2 rounded-full ${darkMode ? 'bg-gray-900 text-indigo-400 hover:bg-gray-800' : 'bg-white text-indigo-600 hover:bg-gray-100'} shadow-lg transition-all`}
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646A9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>

    {/* Connection status indicator */}
    <div className={`fixed top-2 left-2 px-3 py-1 rounded-full text-xs ${
      connectionStatus.includes('Connected') ? 
        'bg-green-500 text-white' : 
      connectionStatus.includes('failed') ? 
        'bg-red-500 text-white' : 
        'bg-yellow-500 text-white'
    } shadow-md z-50`}>
      {connectionStatus}
    </div>

    {/* Error message */}
    {error && (
      <div className={`fixed top-16 right-4 ${darkMode ? 'bg-gray-900 text-red-400' : 'bg-white text-red-600'} p-4 rounded-lg shadow-xl max-w-md z-50 border ${darkMode ? 'border-gray-800' : 'border-red-100'}`}>
        <div className="flex justify-between items-start">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <span>{error}</span>
          </div>
          <button 
            onClick={() => setError(null)}
            className={`ml-4 ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    )}
    {status === 'recording' && (
      <div className={`fixed bottom-4 right-4 ${darkMode ? 'bg-gray-900 text-red-400' : 'bg-white text-red-600'} px-4 py-2 rounded-full shadow-lg animate-pulse flex items-center`}>
        <div className={`w-3 h-3 rounded-full mr-2 ${darkMode ? 'bg-red-400' : 'bg-red-600'}`}></div>
        <span>Recording ({recordingTime}s)</span>
      </div>
    )}
    
    {/* Header */}
    <header className="text-center mb-10">
      <div className={`inline-flex items-center gap-3 ${darkMode ? 'bg-gray-900' : 'bg-white'} ${borderWidth} ${darkMode ? 'border-gray-800' : 'border-gray-200'} shadow-lg px-8 py-4 rounded-full mb-4`}>
        <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
          {/* HTML Icon from Flaticon */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6 text-white"
            viewBox="0 0 384 512"
            fill="currentColor"
          >
            <path d="M0 32l34.9 395.8L192 480l157.1-52.2L384 32H0zm313.1 80l-4.8 47.3L193 208.6l-.3.1h111.5l-12.8 146.6-98.2 28.7-98.8-29.2-6.4-73.9h48.9l3.2 38.3 52.6 13.3 54.7-15.4 3.7-61.6-166.3-.5v-.1l-.2.1-3.6-46.3L193.1 162l6.5-2.7H76.7L70.9 112h242.2z"/>
          </svg>
        </div>
        <h1 className={`text-4xl font-bold bg-gradient-to-r ${darkMode ? 'from-indigo-400 to-purple-500' : 'from-indigo-600 to-purple-700'} bg-clip-text text-transparent`}>
          Visionary UI
        </h1>
      </div>
      <p className={`${textSecondary} max-w-3xl mx-auto text-lg`}>
        Transform your designs, sketches and ideas into clean, responsive HTML & CSS with AI
      </p>
    </header>

    {/* Input Tabs - Modern Centered Navigation */}
    <div className="max-w-7xl mx-auto mb-8 flex justify-center">
      <div className={`flex ${navBarWidth} ${borderWidth} ${darkMode ? 'border-gray-800' : 'border-gray-200'} overflow-x-auto rounded-xl ${shadow}`}>
        <button
          onClick={() => setActiveTab("image")}
          className={`py-3 px-6 font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
            activeTab === "image"
              ? `${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} border-b-2 border-indigo-500`
              : `${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          Image
        </button>
        <button
          onClick={() => setActiveTab("sketch")}
          className={`py-3 px-6 font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
            activeTab === "sketch"
              ? `${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} border-b-2 border-indigo-500`
              : `${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          Sketch
        </button>
        <button
          onClick={() => setActiveTab("text")}
          className={`py-3 px-6 font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
            activeTab === "text"
              ? `${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} border-b-2 border-indigo-500`
              : `${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
          Text
        </button>
        <button
          onClick={() => setActiveTab("voice")}
          className={`py-3 px-6 font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
            activeTab === "voice"
              ? `${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} border-b-2 border-indigo-500`
              : `${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          Voice
        </button>
      </div>
    </div>

    {/* Main Layout */}
    <div className={`max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 ${borderWidth} ${darkMode ? 'border-gray-800' : 'border-gray-200'} rounded-xl ${shadow} p-6 ${cardBg}`}>
      {/* Left Column - Input Section */}
      <div className="flex flex-col space-y-6">
        {/* Image Upload Tab */}
        {activeTab === "image" && (
          <div className={`${cardBg} rounded-xl ${shadow} overflow-hidden ${borderWidth} ${cardBorder}`}>
            <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                Upload Design
              </h2>
            </div>
            <label className="p-6 flex flex-col items-center justify-center cursor-pointer group">
              {image ? (
                <div className="relative w-full">
                  <img
                    src={URL.createObjectURL(image)}
                    alt="Uploaded"
                    className="w-full h-64 object-contain rounded-lg shadow-inner border border-gray-200"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-lg">
                    <span className={`px-3 py-1 rounded-md text-sm font-medium ${shadow} ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
                      Change Image
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className={`w-full h-64 flex flex-col items-center justify-center border-2 border-dashed ${darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-300 hover:border-gray-400'} rounded-lg ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'} transition`}
                  onClick={() => fileInputRef.current.click()}
                >
                  <div className={`p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full mb-3`}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-8 w-8 ${darkMode ? 'text-white' : 'text-gray-700'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <p className={`${textColor} font-medium`}>
                    Drag & drop your image here
                  </p>
                  <p className={`${darkMode ? 'text-gray-500' : 'text-gray-500'} text-sm mt-1`}>
                    or click to browse files
                  </p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                accept="image/*"
              />
            </label>
          </div>
        )}

        {/* Sketch Tab */}
        {activeTab === "sketch" && (
          <div className={`${cardBg} rounded-xl ${shadow} overflow-hidden ${borderWidth} ${cardBorder}`}>
            <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'} flex justify-between items-center`}>
              <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
                Draw Your UI Sketch
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={clearCanvas}
                  className={`px-3 py-1 text-sm ${darkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} rounded ${shadow}`}
                >
                  Clear
                </button>
                <button
                  onClick={saveSketch}
                  className={`px-3 py-1 text-sm ${darkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} rounded ${shadow}`}
                >
                  Save
                </button>
                <input
                  type="file"
                  ref={sketchInputRef}
                  onChange={handleSketchUpload}
                  className="hidden"
                  accept="image/*"
                />
                <button
                  onClick={() => sketchInputRef.current.click()}
                  className={`px-3 py-1 text-sm ${darkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} rounded ${shadow}`}
                >
                  Upload Sketch
                </button>
              </div>
            </div>
            <div className="p-4">
              <canvas
                ref={canvasRef}
                width="800"  // Increased width for better drawing space
                height="600" // Increased height for better drawing space
                className={`w-full h-[600px] border ${canvasBorder} rounded-lg ${canvasBg} cursor-crosshair`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />
            </div>
            {sketch && (
              <div className={`p-4 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${textSecondary}`}>Saved sketch:</span>
                  <img
                    src={URL.createObjectURL(sketch)}
                    alt="Saved sketch"
                    className="h-10 w-10 object-cover rounded border border-gray-200"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Text Input Tab */}
        {activeTab === "text" && (
          <div className={`${cardBg} rounded-xl ${shadow} overflow-hidden ${borderWidth} ${cardBorder}`}>
            <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                  <line x1="4" y1="22" x2="4" y2="15"></line>
                </svg>
                Describe Your UI
              </h2>
            </div>
            <div className="p-5">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Describe the UI you want to create (e.g., 'A login form with email and password fields, a remember me checkbox, and a submit button')"
                className={`w-full p-3 h-64 text-sm border ${darkMode ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-900'} rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition`}
              />
            </div>
          </div>
        )}

        {/* Voice Input Tab */}
        {activeTab === "voice" && (
          <div className={`${cardBg} rounded-xl ${shadow} overflow-hidden ${borderWidth} ${cardBorder}`}>
            <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                Describe Your UI with Voice
              </h2>
            </div>
            <div className="p-5 flex flex-col items-center space-y-4">
              <button
                onClick={isTranscribing ? handleStopRecording : handleStartRecording}
                className={`p-5 rounded-full ${
                  isTranscribing
                    ? "bg-red-500 animate-pulse"
                    : darkMode ? "bg-indigo-600 text-white" : "bg-indigo-600 text-white"
                } ${shadow} transition-transform hover:scale-105`}
              >
                {isTranscribing ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                )}
              </button>
              <p className={`${textSecondary} text-center`}>
                {isTranscribing
                  ? "Recording... Speak now"
                  : "Click to start recording"}
              </p>
              
              {/* Enhanced real-time transcription */}
              {realTimeTranscript && (
                <div className={`w-full ${darkMode ? 'bg-gray-800' : 'bg-gray-100'} rounded-lg ${shadow} p-4 transition-all`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`text-sm font-medium ${textSecondary}`}>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-4 w-4 inline mr-1" 
                        viewBox="0 0 20 20" 
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                      </svg>
                      Live Transcription
                    </h3>
                    <span className={`text-xs ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      {isTranscribing ? 'Listening...' : 'Paused'}
                    </span>
                  </div>
                  <div className={`p-3 rounded ${darkMode ? 'bg-gray-900' : 'bg-white'} ${borderWidth} ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <p className={`${textColor} font-mono text-sm`}>
                      {realTimeTranscript}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prompt and Generate Button */}
        <div className={`${cardBg} rounded-xl ${shadow} overflow-hidden ${borderWidth} ${cardBorder}`}>
          <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Generation Options
            </h2>
          </div>
          <div className="p-5">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Customize the prompt for better results..."
              className={`w-full p-3 text-sm border ${darkMode ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-900'} rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4 h-24 transition`}
            />
            <button
              onClick={generateCode}
              disabled={isLoading}
              className={`w-full px-6 py-3 ${buttonPrimary} font-semibold rounded-lg ${shadow} transition flex items-center justify-center ${
                isLoading ? "opacity-70 cursor-not-allowed" : "hover:shadow-lg"
              }`}
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                  </svg>
                  Generate Code
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {/* Right Column - Output Section */}
      <div className="flex flex-col space-y-6" ref={codeContainerRef}>
        {/* Code Output */}
        <div className={`${cardBg} rounded-xl ${shadow} overflow-hidden h-full flex flex-col ${borderWidth} ${cardBorder}`}>

          <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'} flex justify-between items-center`}>
            <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              Generated Code
            </h2>
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                disabled={!code}
                className={`p-2 rounded-md transition ${
                  code
                    ? `${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`
                    : `${darkMode ? 'text-gray-700 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'}`
                }`}
                title="Copy to clipboard"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button
                onClick={renderUI}
                disabled={!htmlCode && !cssCode}
                className={`p-2 rounded-md transition ${
                  htmlCode || cssCode
                    ? `${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`
                    : `${darkMode ? 'text-gray-700 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'}`
                }`}
                title="Preview UI"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>
          <div className={`flex-1 overflow-auto p-4 ${codeBg} ${darkMode ? 'text-gray-300' : 'text-gray-800'} font-mono text-sm max-h-[500px]`}>
            {code ? (
              <pre className="whitespace-pre-wrap">{code}</pre>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5 text-gray-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Generating code...
                  </div>
                ) : (
                  <p>Your generated code will appear here</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* UI Preview Section */}
    {fullScreenPreview ? (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="p-4 bg-gray-900 flex justify-between items-center">
          <h2 className="text-white font-semibold">UI Preview - Full Screen</h2>
          <button
            onClick={toggleFullScreenPreview}
            className="p-2 text-gray-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1">
          {uiPreview ? (
            <iframe
              title="Generated UI"
              srcDoc={uiPreview}
              className="w-full h-full border-none"
              sandbox="allow-scripts"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 bg-gray-900">
              <div className="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-12 w-12 mx-auto text-gray-600 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-gray-400">Generate code first to see the preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : (
      <div className={`max-w-7xl mx-auto ${cardBg} rounded-xl ${shadow} overflow-hidden ${borderWidth} ${cardBorder}`}>
        <div className={`p-5 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'} flex justify-between items-center`}>
          <h2 className={`font-semibold ${textColor} flex items-center gap-2`}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            UI Preview
          </h2>
          <div className="flex items-center gap-2">
            <div className={`flex ${darkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-lg p-1`}>
              <button
                onClick={() => setActiveTab("code")}
                className={`px-3 py-1 text-sm rounded-md ${
                  activeTab === "code"
                    ? `${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'} ${shadow}`
                    : `${darkMode ? 'text-gray-400' : 'text-gray-700'}`
                }`}
              >
                Code
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 text-sm rounded-md ${
                  activeTab === "preview"
                    ? `${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'} ${shadow}`
                    : `${darkMode ? 'text-gray-400' : 'text-gray-700'}`
                }`}
              >
                Preview
              </button>
            </div>
            <button
              onClick={toggleFullScreenPreview}
              className={`px-4 py-1.5 ${darkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} text-sm font-medium rounded-lg ${shadow} transition flex items-center gap-1`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
              Full Screen
            </button>
            <button
              onClick={renderUI}
              className={`px-4 py-1.5 ${darkMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'} text-sm font-medium rounded-lg ${shadow} transition flex items-center gap-1`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
              </svg>
              Refresh
            </button>
          </div>
        </div>
        <div className={`p-4 ${previewBg} min-h-[600px]`}>
          {activeTab === "code" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`${cardBg} rounded-lg ${shadow} overflow-hidden border ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <div className={`p-3 ${darkMode ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-100 text-gray-900 border-gray-200'} border-b text-sm font-medium flex items-center gap-2`}>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4" 
                    viewBox="0 0 384 512"
                    fill="currentColor"
                  >
                    <path d="M0 32l34.9 395.8L192 480l157.1-52.2L384 32H0zm313.1 80l-4.8 47.3L193 208.6l-.3.1h111.5l-12.8 146.6-98.2 28.7-98.8-29.2-6.4-73.9h48.9l3.2 38.3 52.6 13.3 54.7-15.4 3.7-61.6-166.3-.5v-.1l-.2.1-3.6-46.3L193.1 162l6.5-2.7H76.7L70.9 112h242.2z"/>
                  </svg>
                  HTML
                </div>
                <pre className={`p-4 overflow-auto max-h-[500px] text-sm ${darkMode ? 'bg-gray-900 text-gray-300' : 'bg-white text-gray-800'} font-mono`}>
                  {htmlCode || (
                    <span className="text-gray-500">
                      HTML code will appear here
                    </span>
                  )}
                </pre>
              </div>
              <div className={`${cardBg} rounded-lg ${shadow} overflow-hidden border ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <div className={`p-3 ${darkMode ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-100 text-gray-900 border-gray-200'} border-b text-sm font-medium flex items-center gap-2`}>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4" 
                    viewBox="0 0 384 512"
                    fill="currentColor"
                  >
                    <path d="M0 32l34.9 395.8L192 480l157.1-52.2L384 32H0zm308.2 127.9H124.4l4.1 49.4h175.6l-13.6 148.4-97.9 27v.3h-1.1l-98.7-27.3-6-75.8h47.7L138 320l53.5 14.5 53.7-14.5 6-62.2H84.3L71.5 112.2h241.1l-4.4 47.7z"/>
                  </svg>
                  CSS
                </div>
                <pre className={`p-4 overflow-auto max-h-[500px] text-sm ${darkMode ? 'bg-gray-900 text-gray-300' : 'bg-white text-gray-800'} font-mono`}>
                  {cssCode ? (
                    cssCode.replace("<style>", "").replace("</style>", "")
                  ) : (
                    <span className="text-gray-500">
                      CSS code will appear here
                    </span>
                  )}
                </pre>
              </div>
            </div>
          ) : (
            <div className={`${cardBg} rounded-lg ${shadow} overflow-hidden border ${darkMode ? 'border-gray-800' : 'border-gray-200'} h-[600px]`}>
              {uiPreview ? (
                <iframe
                  title="Generated UI"
                  srcDoc={uiPreview}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 mx-auto text-gray-300 mb-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <p>Generate code first to see the preview</p>
                    <button
                      onClick={generateCode}
                      className={`mt-3 px-4 py-2 ${darkMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'} rounded-lg text-sm font-medium ${shadow} transition`}
                    >
                      Generate Code
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}

    {/* Footer */}
    <footer className={`mt-12 text-center ${textSecondary} text-sm pb-6`}>
      <p>Visionary UI - Designed By Nikitta K S</p>
    </footer>
  </div>
);
};

export default DesignToCode;