"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

export const GsapUnderline = ({ onCreateRoom, onJoinRoom }) => {
  const linksRef = useRef([])

  useEffect(() => {
    linksRef.current.forEach((link) => {
      if (!link) return

      const path = link.querySelector(".underline-path")
      if (!path) return

      const pathLength = path.getTotalLength()

      // Set initial state: stroke visible but not drawn
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

      return () => {
        link.removeEventListener("mouseenter", handleMouseEnter)
        link.removeEventListener("mousele", handleMouseLeave)
      }
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
