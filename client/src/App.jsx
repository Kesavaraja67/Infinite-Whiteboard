"use client"

import { useState, useEffect, useRef, useLayoutEffect } from "react"
import { io } from "socket.io-client"
import { LivingWatercolor } from "./components/LivingWatercolor"
import { GsapUnderline } from "./components/GsapUnderline"
import { Palette, Trash2, Users, LogOut, Undo, MousePointer2, MessageSquare, Send, X, Hand, Type, Image as ImageIcon, MousePointer, Eraser } from "lucide-react"

function App() {
  const [view, setView] = useState("lobby")
  const [roomId, setRoomId] = useState("")
  const [userName, setUserName] = useState("")
  const [socket, setSocket] = useState(null)
  const [cursors, setCursors] = useState({})

  // --- INFINITE CANVAS STATE ---
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)

  // Drawing State (UI)
  const [color, setColor] = useState("#000000")
  const [brushSize, setBrushSize] = useState(3)
  const [tool, setTool] = useState("pencil")
  const [isDrawing, setIsDrawing] = useState(false)

  // --- CRITICAL PERFORMANCE FIX: HISTORY REF ---
  // We use a Ref for drawing logic (instant) and State for React UI (undo button, etc)
  const historyRef = useRef([])
  const [historyTrigger, setHistoryTrigger] = useState(0) // Dummy state to force re-renders only when needed

  // Selection / Moving State
  const [selectedElement, setSelectedElement] = useState(null)

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [msgInput, setMsgInput] = useState("")
  const [hasUnread, setHasUnread] = useState(false)

  // Refs
  const canvasRef = useRef(null)
  const contextRef = useRef(null)
  const startPos = useRef({ x: 0, y: 0 })
  const lastCursorEmit = useRef(0)
  const chatBottomRef = useRef(null)
  const isChatOpenRef = useRef(isChatOpen)

  // Image Cache
  const imageCache = useRef({})

  useEffect(() => {
    isChatOpenRef.current = isChatOpen
  }, [isChatOpen])

  // --- 1. KEYBOARD LISTENERS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && !isChatOpen) {
        setIsSpacePressed(true)
      }
    }
    const handleKeyUp = (e) => {
      if (e.code === "Space") {
        setIsSpacePressed(false)
        setIsPanning(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [isChatOpen])

  // --- 2. CANVAS SETUP ---
  useLayoutEffect(() => {
    if (view === "room" && canvasRef.current) {
      const canvas = canvasRef.current
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      const context = canvas.getContext("2d")
      context.lineCap = "round"
      context.lineJoin = "round"
      contextRef.current = context

      // Prevent native scrolling
      const preventScroll = (e) => e.preventDefault()
      canvas.addEventListener('wheel', preventScroll, { passive: false })

      const handleResize = () => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        // On resize, we MUST redraw everything
        redrawBoard()
      }

      window.addEventListener("resize", handleResize)

      return () => {
        window.removeEventListener("resize", handleResize)
        canvas.removeEventListener('wheel', preventScroll)
      }
    }
  }, [view])

  // Redraw ONLY when Pan/Zoom changes (not when drawing)
  useLayoutEffect(() => {
    if (view === "room") {
      redrawBoard()
    }
  }, [pan, scale, view, historyTrigger])

  // --- 3. SOCKET CONNECTION ---
  useEffect(() => {
    if (view === "room" && !socket) {
      const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

      const newSocket = io(SERVER_URL, {
        transports: ['websocket', 'polling']
      });

      newSocket.on("connect", () => {
        console.log("[v0] Connected to server:", SERVER_URL)
        newSocket.emit("join-room", roomId, userName)
      })

      newSocket.on("sync-board", (history) => {
        historyRef.current = history;
        history.forEach(item => {
          if (item.tool === 'image') preloadImage(item.src);
        })
        setHistoryTrigger(prev => prev + 1); // Trigger redraw
      })

      newSocket.on("sync-chat", (chatHistory) => {
        setMessages(chatHistory)
      })

      // PERFORMANCE FIX: Just append and draw, don't clear!
      newSocket.on("draw", (data) => {
        if (data.tool === 'image') {
          preloadImage(data.src, () => {
            historyRef.current.push(data);
            redrawBoard(); // Images need full redraw to layer correctly
          })
        } else {
          // Instant additive draw (no lag)
          historyRef.current.push(data);
          drawStroke(contextRef.current, data);
        }
      })

      newSocket.on("update-history", (newHistory) => {
        historyRef.current = newHistory;
        setHistoryTrigger(prev => prev + 1);
      })

      newSocket.on("receive-message", (data) => {
        setMessages((prev) => [...prev, data])
        if (!isChatOpenRef.current) {
          setHasUnread(true)
        }
      })

      newSocket.on("cursor-move", (data) => {
        setCursors((prev) => ({ ...prev, [data.userId]: data }))
      })

      newSocket.on("user-disconnected", (userId) => {
        setCursors((prev) => {
          const newCursors = { ...prev };
          delete newCursors[userId];
          return newCursors;
        })
      })

      setSocket(newSocket)

      return () => newSocket.close()
    }
  }, [view, roomId])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isChatOpen])

  const toggleChat = () => {
    if (!isChatOpen) setHasUnread(false)
    setIsChatOpen(!isChatOpen)
  }

  // --- 4. COORDINATE MATH ---
  const toWorld = (screenX, screenY) => {
    return {
      x: (screenX - pan.x) / scale,
      y: (screenY - pan.y) / scale
    }
  }

  // --- 5. IMAGE HELPERS ---
  const preloadImage = (src, callback) => {
    if (imageCache.current[src]) {
      if (callback) callback();
      return;
    }
    const img = new Image();
    img.src = src;
    img.onload = () => {
      imageCache.current[src] = img;
      if (callback) callback();
      redrawBoard();
    };
  }

  // --- 6. HIT DETECTION ---
  const getElementAtPosition = (x, y) => {
    const history = historyRef.current;
    for (let i = history.length - 1; i >= 0; i--) {
      const el = history[i];
      if (el.tool === 'image') {
        if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
          return { ...el, index: i };
        }
      } else if (el.tool === 'text') {
        const textWidth = el.text.length * (el.size * 3);
        const textHeight = el.size * 5;
        if (x >= el.x && x <= el.x + textWidth && y >= el.y && y <= el.y + textHeight) {
          return { ...el, index: i };
        }
      }
    }
    return null;
  }

  // --- 7. DRAG & DROP ---
  const handleDragOver = (e) => {
    e.preventDefault(); e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target.result;
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const worldPos = toWorld(e.clientX, e.clientY);
          let width = img.width;
          let height = img.height;
          const maxSize = 300;
          if (width > maxSize || height > maxSize) {
            const ratio = width / height;
            if (width > height) { width = maxSize; height = maxSize / ratio; }
            else { height = maxSize; width = maxSize * ratio; }
          }
          const imgData = {
            tool: 'image', src: src,
            x: worldPos.x - width / 2, y: worldPos.y - height / 2,
            width, height
          };
          imageCache.current[src] = img;

          // Add to ref immediately
          historyRef.current.push(imgData);
          drawStroke(contextRef.current, imgData);
          if (socket) socket.emit("draw", { roomId, drawOptions: imgData });
        };
      };
      reader.readAsDataURL(file);
    }
  };

  // --- 8. DRAWING LOGIC (The Core Fix) ---
  const redrawBoard = () => {
    const context = contextRef.current
    const canvas = canvasRef.current
    if (!context || !canvas) return

    // 1. Clear Screen
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)

    // 2. Set Zoom/Pan
    context.setTransform(scale, 0, 0, scale, pan.x, pan.y)

    // 3. Draw All History
    const history = historyRef.current;
    history.forEach((stroke) => drawStroke(context, stroke))
  }

  const drawStroke = (context, data) => {
    const { tool, x, y, startX, startY, color, size, text, src, width, height } = data

    context.lineWidth = size
    context.lineCap = "round"
    context.lineJoin = "round"

    // Eraser Logic
    if (tool === 'eraser') {
      context.strokeStyle = "#f9fafb" // Match background color (gray-50)
      context.globalCompositeOperation = "source-over"
    } else {
      context.strokeStyle = color
      context.fillStyle = color
      context.globalCompositeOperation = "source-over"
    }

    context.beginPath()

    if (tool === 'pencil' || tool === 'eraser') {
      context.moveTo(startX, startY)
      context.lineTo(x, y)
      context.stroke()
    } else if (tool === 'rect') {
      context.strokeRect(startX, startY, x - startX, y - startY)
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2))
      context.arc(startX, startY, radius, 0, 2 * Math.PI)
      context.stroke()
    } else if (tool === 'text') {
      context.textBaseline = "top"
      context.font = `${size * 5}px sans-serif`
      context.fillText(text, x, y)
    } else if (tool === 'image') {
      const img = imageCache.current[src];
      if (img) context.drawImage(img, x, y, width, height);
      else preloadImage(src);
    }
  }

  // --- 9. MOUSE HANDLERS ---
  const handleWheel = (e) => {
    e.preventDefault()
    const zoomIntensity = 0.1
    const delta = -Math.sign(e.deltaY)
    let newScale = scale + (delta * zoomIntensity)
    const minScale = 0.1
    const maxScale = 3.0
    newScale = Math.min(Math.max(newScale, minScale), maxScale)
    if (newScale === scale) return
    const worldPos = toWorld(e.clientX, e.clientY)
    const newPan = { x: e.clientX - worldPos.x * newScale, y: e.clientY - worldPos.y * newScale }
    setScale(newScale)
    setPan(newPan)
  }

  const startInteraction = (e) => {
    if (isSpacePressed) {
      setIsPanning(true)
      startPos.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Selection
    if (tool === 'selection') {
      const worldPos = toWorld(e.clientX, e.clientY);
      const element = getElementAtPosition(worldPos.x, worldPos.y);
      if (element) setSelectedElement({ index: element.index, offsetX: worldPos.x - element.x, offsetY: worldPos.y - element.y });
      return;
    }

    // Text
    if (tool === 'text') {
      const worldPos = toWorld(e.clientX, e.clientY)
      const text = prompt("Enter text:")
      if (text) {
        const textData = { tool: 'text', text, x: worldPos.x, y: worldPos.y, color, size: brushSize }

        historyRef.current.push(textData);
        drawStroke(contextRef.current, textData)
        if (socket) socket.emit("draw", { roomId, drawOptions: textData })
      }
      return
    }

    // Drawing
    setIsDrawing(true)
    const worldPos = toWorld(e.clientX, e.clientY)
    startPos.current = worldPos

    if (tool === 'pencil' || tool === 'eraser') {
      contextRef.current.beginPath()
      contextRef.current.moveTo(worldPos.x, worldPos.y)
    }
  }

  const handleMove = (e) => {
    const { clientX, clientY } = e

    // Cursor Emitting
    const now = Date.now()
    if (socket && now - lastCursorEmit.current > 50) {
      const worldPos = toWorld(clientX, clientY)
      socket.emit("cursor-move", { roomId, userId: socket.id, userName, x: worldPos.x, y: worldPos.y })
      lastCursorEmit.current = now
    }

    if (isPanning) {
      const dx = clientX - startPos.current.x
      const dy = clientY - startPos.current.y
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      startPos.current = { x: clientX, y: clientY }
      return
    }

    if (tool === 'selection' && selectedElement) {
      const worldPos = toWorld(clientX, clientY);
      const history = historyRef.current;
      const el = history[selectedElement.index];
      el.x = worldPos.x - selectedElement.offsetX;
      el.y = worldPos.y - selectedElement.offsetY;
      setHistoryTrigger(prev => prev + 1); // Redraw
      return;
    }

    if (!isDrawing) return

    const worldPos = toWorld(clientX, clientY)

    if (tool === 'pencil' || tool === 'eraser') {
      const prevWorldX = startPos.current.x
      const prevWorldY = startPos.current.y

      const strokeData = {
        tool: tool, // 'pencil' or 'eraser'
        x: worldPos.x,
        y: worldPos.y,
        startX: prevWorldX,
        startY: prevWorldY,
        color,
        size: tool === 'eraser' ? brushSize * 5 : brushSize // Eraser is bigger
      }

      // Additive Draw (FAST) - No clearRect!
      historyRef.current.push(strokeData);
      drawStroke(contextRef.current, strokeData)

      if (socket) socket.emit("draw", { roomId, drawOptions: strokeData })

      startPos.current = worldPos
    } else {
      // Shapes need redraw to preview
      redrawBoard()
      drawStroke(contextRef.current, {
        tool,
        x: worldPos.x,
        y: worldPos.y,
        startX: startPos.current.x,
        startY: startPos.current.y,
        color,
        size: brushSize
      })
    }
  }

  const stopInteraction = (e) => {
    if (isPanning) setIsPanning(false)
    else if (tool === 'selection' && selectedElement) {
      if (socket) socket.emit("update-history", { roomId, newHistory: historyRef.current });
      setSelectedElement(null);
    }
    else if (isDrawing) {
      setIsDrawing(false)
      // For shapes, we commit the final stroke now
      if (tool !== 'pencil' && tool !== 'eraser' && tool !== 'text' && tool !== 'selection' && socket) {
        const worldPos = toWorld(e.clientX, e.clientY)
        const shapeData = {
          roomId,
          drawOptions: {
            tool,
            x: worldPos.x,
            y: worldPos.y,
            startX: startPos.current.x,
            startY: startPos.current.y,
            color,
            size: brushSize
          }
        }
        historyRef.current.push(shapeData.drawOptions);
        socket.emit("draw", shapeData)
      }
    }
  }

  // --- 10. CONTROLS ---
  const sendMessage = (e) => {
    e.preventDefault()
    if (msgInput.trim() && socket) {
      const msgData = { roomId, user: userName || "Guest", text: msgInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      socket.emit("send-message", msgData)
      setMessages(prev => [...prev, msgData])
      setMsgInput("")
    }
  }

  const handleUndo = () => socket?.emit("undo", roomId)
  const handleClearBoard = () => socket?.emit("clear", roomId)
  const handleLeaveRoom = () => {
    socket?.close(); setSocket(null); setView("lobby"); setRoomId("");
    historyRef.current = []; setCursors({}); setMessages([]); setHasUnread(false); setPan({ x: 0, y: 0 }); setScale(1)
  }
  const handleCreateRoom = () => { if (!userName) return alert("Enter Name"); setRoomId(Math.random().toString(36).substring(2, 9)); setView("room"); }
  const handleJoinRoom = () => { if (!userName) return alert("Enter Name"); const id = prompt("Room ID:"); if (id) { setRoomId(id); setView("room"); } }

  const colors = ["#000000", "#ff6b6b", "#4ecdc4", "#45b7d1", "#f7b731", "#5f27cd", "#00d2d3", "#ff9ff3"]

  if (view === "lobby") return (
    <>
      <LivingWatercolor />
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-3xl p-12 max-w-2xl w-full text-center">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">LiveBoard</h1>
          <p className="text-xl text-gray-700 mb-8">Infinite Canvas • Real-Time • Persistent</p>
          <input type="text" placeholder="Enter Your Name" value={userName} onChange={e => setUserName(e.target.value)} className="w-full max-w-xs px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-8 text-center" />
          <div className="flex items-center justify-center gap-3 mb-8 text-gray-600">
            <Users className="w-5 h-5" />
            <span>Draw & Chat Together</span>
          </div>
          <GsapUnderline onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
        </div>
      </div>
    </>
  )

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-50" onDragOver={handleDragOver} onDrop={handleDrop}>
      <canvas ref={canvasRef} onMouseDown={startInteraction} onMouseMove={handleMove} onMouseUp={stopInteraction} onMouseLeave={stopInteraction} onWheel={handleWheel}
        className={`absolute inset-0 z-0 ${isSpacePressed ? "cursor-grab active:cursor-grabbing" : tool === 'selection' ? "cursor-default" : "cursor-crosshair"}`}
      />
      <div className="absolute top-6 left-6 bg-black/10 px-3 py-1 rounded-full text-xs font-mono text-gray-500 select-none pointer-events-none">Zoom: {Math.round(scale * 100)}%</div>

      {Object.values(cursors).map(c => {
        const sx = c.x * scale + pan.x, sy = c.y * scale + pan.y
        return <div key={c.userId} className="absolute pointer-events-none z-50 flex items-start" style={{ left: sx, top: sy }}><MousePointer2 className="w-5 h-5 text-purple-600 fill-purple-600" /><span className="bg-purple-600 text-white text-[10px] px-1 rounded ml-1">{c.userName}</span></div>
      })}

      <div className="glass-toolbar fixed top-6 left-1/2 -translate-x-1/2 rounded-2xl px-6 py-4 flex items-center gap-6 z-10 shadow-2xl bg-white/90 backdrop-blur-lg border border-white/50">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setTool('selection')} className={`p-2 rounded ${tool === 'selection' ? 'bg-white shadow' : ''}`}><MousePointer className="w-5 h-5" /></button>
          <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>
          <button onClick={() => setTool('pencil')} className={`p-2 rounded ${tool === 'pencil' ? 'bg-white shadow' : ''}`}>✏️</button>
          <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-white shadow' : ''}`} title="Eraser"><Eraser className="w-5 h-5" /></button>
          <button onClick={() => setTool('rect')} className={`p-2 rounded ${tool === 'rect' ? 'bg-white shadow' : ''}`}>⬜</button>
          <button onClick={() => setTool('circle')} className={`p-2 rounded ${tool === 'circle' ? 'bg-white shadow' : ''}`}>⭕</button>
          <button onClick={() => setTool('text')} className={`p-2 rounded ${tool === 'text' ? 'bg-white shadow' : ''}`}><Type className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-2">{colors.map(c => <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border border-gray-200 ${color === c ? "scale-110 ring-2 ring-gray-800" : ""}`} style={{ backgroundColor: c }} />)}</div>
        <div className="w-[1px] h-8 bg-gray-300"></div>
        <input type="range" min="1" max="50" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-24 accent-purple-600" />
        <div className="w-[1px] h-8 bg-gray-300"></div>
        <button onClick={handleUndo} className="p-2 hover:bg-gray-200 rounded-lg"><Undo className="w-5 h-5" /></button>
        <button onClick={handleClearBoard} className="p-2 hover:bg-red-100 text-red-500 rounded-lg"><Trash2 className="w-5 h-5" /></button>
        <div className={`p-2 rounded-lg ${isSpacePressed ? "bg-purple-100 text-purple-600" : "text-gray-400"}`}><Hand className="w-5 h-5" /></div>
        <button onClick={handleLeaveRoom} className="p-2 hover:bg-gray-200 rounded-lg"><LogOut className="w-5 h-5" /></button>
        <div className="relative"><button onClick={toggleChat} className={`p-2 rounded-lg ${isChatOpen ? 'bg-purple-100 text-purple-600' : 'hover:bg-gray-200'}`}><MessageSquare className="w-5 h-5" /></button>{hasUnread && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}</div>
      </div>

      {isChatOpen && <div className="fixed bottom-6 right-6 w-80 bg-white/90 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50"><div className="bg-purple-600 p-4 flex justify-between items-center text-white"><span className="font-bold">Chat</span><button onClick={() => setIsChatOpen(false)}><X className="w-4 h-4" /></button></div><div className="h-64 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50">{messages.map((msg, idx) => <div key={idx} className={`flex flex-col ${msg.user === userName ? 'items-end' : 'items-start'}`}><div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.user === userName ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-white border border-gray-200'}`}>{msg.text}</div></div>)}<div ref={chatBottomRef} /></div><form onSubmit={sendMessage} className="p-3 bg-white border-t flex gap-2"><input className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Message..." value={msgInput} onChange={e => setMsgInput(e.target.value)} /><button type="submit" className="bg-purple-600 text-white p-2 rounded-lg"><Send className="w-4 h-4" /></button></form></div>}
      <div className="fixed top-6 right-6 bg-white/80 backdrop-blur px-4 py-2 rounded-full text-sm font-mono shadow-sm">Room: {roomId}</div>
    </div>
  )
}

export default App