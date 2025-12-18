"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Users, LogOut, Palette, Trash2 } from "lucide-react"

// Living Watercolor Background Component
const LivingWatercolor = () => (
  <div className="fixed inset-0 -z-10 bg-white overflow-hidden pointer-events-none">
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <filter id="watercolor-bleed">
        <feTurbulence type="fractalNoise" baseFrequency="0.01 0.03" numOctaves="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="100" />
      </filter>
    </svg>
    <div className="watercolor-canvas">
      <div className="splotch splotch-1"></div>
      <div className="splotch splotch-2"></div>
    </div>
  </div>
)

// GSAP Underline Component
const GsapUnderline = ({ onCreateRoom, onJoinRoom }: { onCreateRoom: () => void; onJoinRoom: () => void }) => {
  const linksRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    // Dynamic import of GSAP to avoid SSR issues
    import("gsap").then(({ default: gsap }) => {
      linksRef.current.forEach((link) => {
        if (!link) return

        const path = link.querySelector(".underline-path") as SVGPathElement
        if (!path) return

        const pathLength = path.getTotalLength()

        gsap.set(path, {
          strokeDasharray: pathLength,
          strokeDashoffset: pathLength,
        })

        const handleMouseEnter = () => {
          gsap.to(path, {
            strokeDashoffset: 0,
            duration: 0.6,
            ease: "power2.out",
          })
        }

        const handleMouseLeave = () => {
          gsap.to(path, {
            strokeDashoffset: pathLength,
            duration: 0.4,
            ease: "power2.in",
          })
        }

        link.addEventListener("mouseenter", handleMouseEnter)
        link.addEventListener("mouseleave", handleMouseLeave)
      })
    })
  }, [])

  const links = [
    { text: "Create Room", onClick: onCreateRoom },
    { text: "Join Room", onClick: onJoinRoom },
    { text: "Features", onClick: () => alert("Collaborative drawing in real-time!") },
  ]

  return (
    <div className="cloneable">
      {links.map((link, index) => (
        <div key={index} ref={(el) => (linksRef.current[index] = el)} className="text-draw" onClick={link.onClick}>
          <p className="text-draw__p">{link.text}</p>
          <div className="text-draw__box">
            <svg className="text-draw__box-svg" viewBox="0 0 200 30" preserveAspectRatio="none">
              <path
                className="underline-path"
                d="M0,20 Q50,10 100,20 T200,20"
                fill="none"
                stroke="#ff6b6b"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      ))}
    </div>
  )
}

// Main LiveBoard App
export default function Page() {
  const [view, setView] = useState<"lobby" | "room">("lobby")
  const [roomId, setRoomId] = useState("")
  const [currentColor, setCurrentColor] = useState("#000000")
  const [isDrawing, setIsDrawing] = useState(false)
  const [socket, setSocket] = useState<any>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)

  // Initialize canvas
  useEffect(() => {
    if (view === "room" && canvasRef.current) {
      const canvas = canvasRef.current
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      const context = canvas.getContext("2d")
      if (context) {
        context.lineCap = "round"
        context.lineJoin = "round"
        context.lineWidth = 3
        contextRef.current = context
      }

      const handleResize = () => {
        if (!context) return
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        context.putImageData(imageData, 0, 0)
        context.lineCap = "round"
        context.lineJoin = "round"
        context.lineWidth = 3
      }

      window.addEventListener("resize", handleResize)
      return () => window.removeEventListener("resize", handleResize)
    }
  }, [view])

  // Initialize socket connection
  useEffect(() => {
    if (view === "room" && !socket) {
      // Dynamic import to avoid SSR issues
      import("socket.io-client").then(({ io }) => {
        const newSocket = io()

        newSocket.on("connect", () => {
          console.log("[v0] Connected to server")
          newSocket.emit("join-room", roomId)
        })

        newSocket.on("load-drawing", (drawingData: any[]) => {
          console.log("[v0] Loading existing drawing data")
          drawingData.forEach((data) => {
            drawOnCanvas(data, false)
          })
        })

        newSocket.on("draw", (data: any) => {
          drawOnCanvas(data, false)
        })

        newSocket.on("clear", () => {
          clearCanvas()
        })

        newSocket.on("user-joined", (userId: string) => {
          console.log("[v0] User joined:", userId)
        })

        setSocket(newSocket)
      })
    }

    return () => {
      if (socket) {
        socket.close()
      }
    }
  }, [view, roomId])

  const drawOnCanvas = (data: any, emit = true) => {
    const context = contextRef.current
    if (!context) return

    const { x0, y0, x1, y1, color } = data

    context.strokeStyle = color
    context.beginPath()
    context.moveTo(x0, y0)
    context.lineTo(x1, y1)
    context.stroke()

    if (emit && socket) {
      socket.emit("draw", {
        roomId,
        drawData: data,
      })
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const { offsetX, offsetY } = e.nativeEvent
    contextRef.current?.beginPath()
    contextRef.current?.moveTo(offsetX, offsetY)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const { offsetX, offsetY, movementX, movementY } = e.nativeEvent

    const prevX = offsetX - movementX
    const prevY = offsetY - movementY

    drawOnCanvas(
      {
        x0: prevX,
        y0: prevY,
        x1: offsetX,
        y1: offsetY,
        color: currentColor,
      },
      true,
    )
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    contextRef.current?.closePath()
  }

  const clearCanvas = () => {
    const context = contextRef.current
    const canvas = canvasRef.current
    if (context && canvas) {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  const handleClearBoard = () => {
    clearCanvas()
    if (socket) {
      socket.emit("clear", roomId)
    }
  }

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 9)
    setRoomId(newRoomId)
    setView("room")
  }

  const handleJoinRoom = () => {
    const inputRoomId = prompt("Enter Room ID:")
    if (inputRoomId) {
      setRoomId(inputRoomId)
      setView("room")
    }
  }

  const handleLeaveRoom = () => {
    if (socket) {
      socket.close()
      setSocket(null)
    }
    setView("lobby")
    setRoomId("")
  }

  const colors = ["#000000", "#ff6b6b", "#4ecdc4", "#45b7d1", "#f7b731", "#5f27cd", "#00d2d3", "#ff9ff3"]

  if (view === "lobby") {
    return (
      <>
        <LivingWatercolor />
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl p-12 max-w-2xl w-full text-center">
            <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              LiveBoard
            </h1>
            <p className="text-xl text-gray-700 mb-8">Real-Time Collaborative Whiteboard</p>
            <div className="flex items-center justify-center gap-3 mb-8 text-gray-600">
              <Users className="w-5 h-5" />
              <span>Draw together in real-time</span>
            </div>
            <GsapUnderline onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        className="absolute inset-0 cursor-crosshair"
      />

      <div className="glass-toolbar fixed top-6 left-1/2 -translate-x-1/2 rounded-2xl px-6 py-4 flex items-center gap-6 z-10">
        <div className="flex items-center gap-2 pr-6 border-r border-gray-300">
          <Users className="w-5 h-5 text-gray-700" />
          <span className="font-mono font-semibold text-gray-800">Room: {roomId}</span>
        </div>

        <div className="flex items-center gap-3">
          <Palette className="w-5 h-5 text-gray-700" />
          <div className="flex gap-2">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setCurrentColor(color)}
                className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                  currentColor === color ? "ring-2 ring-offset-2 ring-gray-800 scale-110" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleClearBoard}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>

        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Leave
        </button>
      </div>
    </div>
  )
}
