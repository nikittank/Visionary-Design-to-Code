# Visionary UI: AI-Powered Design-to-Code Conversion System

## Overview
Visionary UI is an advanced AI system that automatically converts visual designs, hand-drawn sketches, text descriptions, and voice inputs into production-ready HTML/CSS code. Leveraging Google Gemini AI for multimodal understanding and AWS Transcribe for real-time speech processing, this solution bridges the gap between design ideation and implementation.

## Key Features
- **Image-to-Code Conversion**: Transform UI screenshots into pixel-perfect HTML/CSS
- **Sketch-to-Code Translation**: Convert hand-drawn wireframes via canvas input
- **Voice-to-Code Functionality**: Real-time speech transcription and code generation
- **Interactive Live Preview**: Instant rendering of generated code with dark/light mode support
- **Multimodal Input Processing**: Supports images, sketches, text, and voice inputs

## Technical Implementation

### Core Technologies
- **Frontend**: React with Tailwind CSS
- **Backend**: Express.js with Multer for file handling
- **AI Processing**: Google Gemini 2.5 Flash for multimodal code generation
- **Speech Processing**: AWS Transcribe Streaming API
- **Real-Time Communication**: WebSocket implementation
- **Deployment**: Render/Vercel cloud hosting

### System Architecture
The solution follows a modular architecture:
1. Input layer processes images, sketches, or voice
2. AI processing layer with Gemini for code generation
3. Output layer with code sanitization and live preview

## Technical Highlights
- **Image Processing**: Multer file upload → Base64 encoding → Gemini vision processing
- **Sketch Conversion**: HTML5 Canvas integration with PNG export → Gemini analysis
- **Voice Integration**: AWS Transcribe streaming with WebSocket synchronization
- **Code Generation**: Google Gemini prompt engineering for responsive HTML/CSS output

![deepseek_mermaid_20250609_e1a805](https://github.com/user-attachments/assets/94ddc3bd-ce98-4cfe-9b58-9a58115a0983)

![s](https://github.com/user-attachments/assets/a29e94de-78b5-4b22-9dcf-3837ef7889fb)

