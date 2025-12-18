# LiveBoard - Real-Time Collaborative Whiteboard

A beautiful, production-ready collaborative whiteboard application with real-time drawing synchronization.
> **🚀 Live Demo:** [https://infinite-whiteboard.vercel.app/](https://infinite-whiteboard.vercel.app/)

## Features

- **Real-time Collaboration**: Draw with multiple users simultaneously
- **Room-based Sessions**: Create or join rooms with unique IDs
- **Beautiful UI**: Living watercolor animations and glassmorphism design
- **GSAP Animations**: Smooth animated underlines on navigation
- **Color Palette**: 8 vibrant colors to choose from
- **Clear Board**: Reset the canvas for all users in the room

## Tech Stack

### Frontend
- React 18 with Vite
- Tailwind CSS v4
- GSAP for animations
- Socket.io-client for real-time communication
- Lucide React for icons

### Backend
- Node.js with Express
- Socket.io for WebSocket connections
- CORS enabled for development

## Getting Started

### Installation

1. Install all dependencies:
```bash
npm run install:all
```

### Running the Application

Start both the server and client concurrently:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## How to Use

1. **Create a Room**: Click "Create Room" to start a new session
2. **Join a Room**: Click "Join Room" and enter a room ID
3. **Draw**: Use your mouse to draw on the canvas
4. **Change Colors**: Click any color in the toolbar
5. **Clear Board**: Click the clear button to reset the canvas
6. **Leave Room**: Click leave to return to the lobby

## Project Structure

```
liveboard/
├── server/              # Backend server
│   ├── index.js        # Express + Socket.io server
│   └── package.json    # Server dependencies
├── client/             # Frontend application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── App.jsx     # Main application
│   │   ├── main.jsx    # Entry point
│   │   └── index.css   # Styles with animations
│   ├── vite.config.js  # Vite configuration with proxy
│   └── package.json    # Client dependencies
└── package.json        # Root package with concurrently
```

## Replit Compatibility

This project is optimized for Replit with:
- Vite proxy configuration for WebSocket connections
- Proper CORS settings
- Host configuration for external access
- Monorepo structure with separate client/server

## Customization

- **Colors**: Edit the `colors` array in `App.jsx`
- **Animations**: Modify keyframes in `index.css`
- **Drawing Settings**: Adjust line width and style in canvas initialization
