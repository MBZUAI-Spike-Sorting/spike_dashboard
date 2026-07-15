import React, { useState, useRef, useEffect } from 'react';
import './DockableWidget.css';

const DockableWidget = ({
  id,
  title,
  children,
  onClose,
  onMinimize,
  onMaximize,
  onLayoutChange,
  isMinimized = false,
  isMaximized = false,
  draggable = true,
  resizable = true,
  style = {}
}) => {
  const widgetRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragState = useRef(null);
  const resizeState = useRef(null);

  const notifyLayoutChange = () => {
    if (!onLayoutChange || !widgetRef.current) return;

    const widget = widgetRef.current;
    const panel = widget.parentElement;
    if (!panel) return;

    const panelStyle = window.getComputedStyle(panel);
    const rect = widget.getBoundingClientRect();

    onLayoutChange(id, {
      position: {
        left: parseFloat(panelStyle.left) || 0,
        top: parseFloat(panelStyle.top) || 0
      },
      size: {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });
  };

  const handleDragMouseMove = (e) => {
    if (!dragState.current || !widgetRef.current) return;

    const panel = widgetRef.current.parentElement;
    if (!panel) return;

    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;

    panel.style.left = `${dragState.current.left + dx}px`;
    panel.style.top = `${dragState.current.top + dy}px`;
  };

  const handleDragMouseUp = () => {
    dragState.current = null;
    setIsDragging(false);
    document.removeEventListener('mousemove', handleDragMouseMove);
    document.removeEventListener('mouseup', handleDragMouseUp);
    notifyLayoutChange();
  };

  const startDrag = (e) => {
    if (!draggable || isMaximized) return;
    if (!e.target.closest('.widget-header')) return;
    if (e.target.closest('.widget-controls')) return;

    const widget = widgetRef.current;
    const panel = widget?.parentElement;
    if (!panel) return;

    const style = window.getComputedStyle(panel);

    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0
    };

    setIsDragging(true);
    document.addEventListener('mousemove', handleDragMouseMove);
    document.addEventListener('mouseup', handleDragMouseUp);
  };

  const handleResizeMouseMove = (e) => {
    if (!resizeState.current || !widgetRef.current) return;

    const widget = widgetRef.current;
    const panel = widget.parentElement;
    if (!panel) return;

    const r = resizeState.current;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;

    let width = r.width;
    let height = r.height;
    let left = r.left;
    let top = r.top;

    if (r.direction.includes('e')) width = Math.max(220, r.width + dx);
    if (r.direction.includes('s')) height = Math.max(160, r.height + dy);

    if (r.direction.includes('w')) {
      const nextWidth = Math.max(220, r.width - dx);
      left = r.left + (r.width - nextWidth);
      width = nextWidth;
    }

    if (r.direction.includes('n')) {
      const nextHeight = Math.max(160, r.height - dy);
      top = r.top + (r.height - nextHeight);
      height = nextHeight;
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    widget.style.width = `${width}px`;
    widget.style.height = `${height}px`;
    widget.style.flex = 'none';
  };

  const handleResizeMouseUp = () => {
    resizeState.current = null;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMouseMove);
    document.removeEventListener('mouseup', handleResizeMouseUp);
    notifyLayoutChange();
  };

  const startResize = (e, direction) => {
    if (!resizable || isMinimized || isMaximized) return;

    e.preventDefault();
    e.stopPropagation();

    const widget = widgetRef.current;
    const panel = widget?.parentElement;
    if (!widget || !panel) return;

    const rect = widget.getBoundingClientRect();
    const panelStyle = window.getComputedStyle(panel);

    resizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      left: parseFloat(panelStyle.left) || 0,
      top: parseFloat(panelStyle.top) || 0,
      direction
    };

    setIsResizing(true);
    document.addEventListener('mousemove', handleResizeMouseMove);
    document.addEventListener('mouseup', handleResizeMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDragMouseMove);
      document.removeEventListener('mouseup', handleDragMouseUp);
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, []);

  return (
    <div
      ref={widgetRef}
      className={`dockable-widget ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      data-widget-id={id}
      style={style}
    >
      <div className="widget-header" onMouseDown={startDrag}>
        <div className="widget-title">{title}</div>

        <div className="widget-controls">
          <button
            className="widget-control-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMinimize?.(id);
            }}
            type="button"
          >
            −
          </button>

          <button
            className="widget-control-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMaximize?.(id);
            }}
            type="button"
          >
            □
          </button>

          <button
            className="widget-control-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.(id);
            }}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="widget-content">
          {children}
        </div>
      )}

      {!isMinimized && !isMaximized && resizable && (
        <>
          <div className="widget-resize-handle widget-resize-e" onMouseDown={(e) => startResize(e, 'e')} />
          <div className="widget-resize-handle widget-resize-s" onMouseDown={(e) => startResize(e, 's')} />
          <div className="widget-resize-handle widget-resize-se" onMouseDown={(e) => startResize(e, 'se')} />
          <div className="widget-resize-handle widget-resize-w" onMouseDown={(e) => startResize(e, 'w')} />
          <div className="widget-resize-handle widget-resize-n" onMouseDown={(e) => startResize(e, 'n')} />
          <div className="widget-resize-handle widget-resize-sw" onMouseDown={(e) => startResize(e, 'sw')} />
          <div className="widget-resize-handle widget-resize-ne" onMouseDown={(e) => startResize(e, 'ne')} />
          <div className="widget-resize-handle widget-resize-nw" onMouseDown={(e) => startResize(e, 'nw')} />
        </>
      )}
    </div>
  );
};

export default DockableWidget;