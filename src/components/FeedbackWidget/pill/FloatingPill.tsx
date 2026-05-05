import type { MutableRefObject, Ref } from 'react'
import { Bot, Eye, EyeOff, Menu, MessageCircle, X } from 'lucide-react'
import { VtooltipContent, VtooltipItem, VtooltipRoot, VtooltipTrigger } from '../../VTooltipMenu'
import { WIDGET_ATTR } from '../constants'
import type { Mode } from '../types'

interface FloatingPillProps {
  pillRef: Ref<HTMLDivElement>
  pillPos: { x: number; y: number }
  draggingRef: MutableRefObject<boolean>
  didDragRef: MutableRefObject<boolean>
  onPointerDown: (e: React.PointerEvent) => void
  mode: Mode
  pinsVisible: boolean
  onTogglePins: () => void
  agentsRevealed: boolean
  onOpenAgent: () => void
  badgeAnim: boolean
  commentCount: number
  onToggleSidebar: () => void
  onToggleMode: () => void
}

export function FloatingPill({
  pillRef,
  pillPos,
  draggingRef,
  didDragRef,
  onPointerDown,
  mode,
  pinsVisible,
  onTogglePins,
  agentsRevealed,
  onOpenAgent,
  badgeAnim,
  commentCount,
  onToggleSidebar,
  onToggleMode,
}: FloatingPillProps) {
  return (
    <div
      ref={pillRef}
      {...{ [WIDGET_ATTR]: '' }}
      onPointerDown={onPointerDown}
      style={{
        position: 'fixed',
        left: pillPos.x,
        top: pillPos.y,
        zIndex: 2147483647,
        cursor: draggingRef.current ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <VtooltipRoot springConfig={{ type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.8 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: '6px 6px',
            borderRadius: 9999,
            background: '#000',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <VtooltipItem index={0}>
            <VtooltipTrigger
              onClick={(e: React.MouseEvent) => {
                if (didDragRef.current) { e.preventDefault(); return }
                onToggleMode()
              }}
            >
              <div className="fw-pill-icon" style={{ position: 'relative', display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, background: mode !== 'idle' ? '#333333' : 'transparent' }}>
                {mode !== 'idle' ? (
                  <X style={{ width: 18, height: 18 }} />
                ) : (
                  <MessageCircle style={{ width: 18, height: 18 }} />
                )}
              </div>
              <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Comment</span>
            </VtooltipTrigger>
            <VtooltipContent>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', padding: '0 8px', fontSize: 14, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                {mode !== 'idle' ? 'Exit' : 'Comment'}
                <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: '1px solid rgba(255,255,255,0.3)', padding: 2, fontSize: 12, color: '#fff' }}>C</span>
              </div>
            </VtooltipContent>
          </VtooltipItem>

          <VtooltipItem index={1}>
            <VtooltipTrigger
              onClick={(e: React.MouseEvent) => {
                if (didDragRef.current) { e.preventDefault(); return }
                onTogglePins()
              }}
            >
              <div className="fw-pill-icon" style={{ position: 'relative', display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, background: !pinsVisible ? '#333333' : 'transparent' }}>
                {pinsVisible ? <Eye style={{ width: 18, height: 18 }} /> : <EyeOff style={{ width: 18, height: 18 }} />}
              </div>
              <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{pinsVisible ? 'Hide pins' : 'Show pins'}</span>
            </VtooltipTrigger>
            <VtooltipContent>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', padding: '0 8px', fontSize: 14, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                {pinsVisible ? 'Hide pins' : 'Show pins'}
                <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: '1px solid rgba(255,255,255,0.3)', padding: 2, fontSize: 12, color: '#fff' }}>H</span>
              </div>
            </VtooltipContent>
          </VtooltipItem>

          {agentsRevealed && (
            <VtooltipItem index={2} key="agent">
              <VtooltipTrigger
                onClick={(e: React.MouseEvent) => {
                  if (didDragRef.current) { e.preventDefault(); return }
                  onOpenAgent()
                }}
              >
                <div className="fw-pill-icon" style={{ position: 'relative', display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, animation: 'fw-agent-reveal 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
                  <Bot style={{ width: 18, height: 18 }} />
                </div>
                <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Connect agent</span>
              </VtooltipTrigger>
              <VtooltipContent>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', padding: '0 8px', fontSize: 14, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                  Connect agent
                </div>
              </VtooltipContent>
            </VtooltipItem>
          )}

          <VtooltipItem index={agentsRevealed ? 3 : 2} key={`menu-${agentsRevealed}`}>
            <VtooltipTrigger
              onClick={(e: React.MouseEvent) => {
                if (didDragRef.current) { e.preventDefault(); return }
                onToggleSidebar()
              }}
            >
              <div className="fw-pill-icon" style={{ position: 'relative', display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9999 }}>
                <Menu style={{ width: 18, height: 18 }} />
                {commentCount > 0 && (
                  <div style={{
                    position: 'absolute',
                    right: 2,
                    top: 2,
                    width: 6,
                    height: 6,
                    borderRadius: 9999,
                    border: '1.7px solid #000',
                    background: '#0ea5e9',
                    animation: badgeAnim ? 'fw-badge-pop 0.4s ease' : 'none',
                  }} />
                )}
              </div>
              <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Menu</span>
            </VtooltipTrigger>
            <VtooltipContent>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', padding: '0 8px', fontSize: 14, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                Feedback
                <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: '1px solid rgba(255,255,255,0.3)', padding: 2, fontSize: 12, color: '#fff' }}>F</span>
              </div>
            </VtooltipContent>
          </VtooltipItem>
        </div>
      </VtooltipRoot>
    </div>
  )
}
