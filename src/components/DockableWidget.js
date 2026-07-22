import React, { useState, useRef, useEffect } from 'react';
import './DockableWidget.css';

export const normalizeInteractionScale = (scale) => {
  const numericScale = Number(scale);
  return Number.isFinite(numericScale) && numericScale > 0 ? numericScale : 1;
};

export const calculateResizeLayout = (resizeState, clientX, clientY, scale = 1) => {
  const interactionScale = normalizeInteractionScale(scale);
  const dx = (clientX - resizeState.startX) / interactionScale;
  const dy = (clientY - resizeState.startY) / interactionScale;

  let width = resizeState.width;
  let height = resizeState.height;
  let left = resizeState.left;
  let top = resizeState.top;

  if (resizeState.direction.includes('e')) width = Math.max(220, resizeState.width + dx);
  if (resizeState.direction.includes('s')) height = Math.max(160, resizeState.height + dy);

  if (resizeState.direction.includes('w')) {
    const nextWidth = Math.max(220, resizeState.width - dx);
    left = resizeState.left + (resizeState.width - nextWidth);
    width = nextWidth;
  }

  if (resizeState.direction.includes('n')) {
    const nextHeight = Math.max(160, resizeState.height - dy);
    top = resizeState.top + (resizeState.height - nextHeight);
    height = nextHeight;
  }

  return { width, height, left, top };
};

const MIN_VISIBLE_HEADER_WIDTH = 96;

export const constrainWidgetPosition = ({
  left,
  top,
  widgetWidth,
  headerHeight,
  containerWidth,
  containerHeight
}) => {
  const visibleHeaderWidth = Math.min(MIN_VISIBLE_HEADER_WIDTH, widgetWidth);
  const minLeft = Math.min(0, visibleHeaderWidth - widgetWidth);
  const maxLeft = Math.max(0, containerWidth - visibleHeaderWidth);
  const maxTop = Math.max(0, containerHeight - headerHeight);

  return {
    left: Math.min(maxLeft, Math.max(minLeft, left)),
    top: Math.min(maxTop, Math.max(0, top))
  };
};

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
  interactionScale = 1,
  constrainToParent = false,
  layoutPosition = null,
  style = {}
}) => {
  const widgetRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragState = useRef(null);
  const resizeState = useRef(null);

  const getConstrainedPosition = (panel, widget, left, top) => {
    if (!constrainToParent) return { left, top };

    const container = panel.parentElement;
    const header = widget.querySelector('.widget-header');
    if (!container || !header) return { left, top };

    return constrainWidgetPosition({
      left,
      top,
      widgetWidth: widget.offsetWidth,
      headerHeight: header.offsetHeight,
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight
    });
  };

  const notifyLayoutChange = () => {
    if (!onLayoutChange || !widgetRef.current) return;

    const widget = widgetRef.current;
    const panel = widget.parentElement;
    if (!panel) return;

    const panelStyle = window.getComputedStyle(panel);
    const scale = normalizeInteractionScale(interactionScale);
    const rect = widget.getBoundingClientRect();

    onLayoutChange(id, {
      position: {
        left: parseFloat(panelStyle.left) || 0,
        top: parseFloat(panelStyle.top) || 0
      },
      size: {
        // offsetWidth/offsetHeight remain in layout pixels when CSS zoom is used.
        // Keep a rect fallback for DOM implementations that do not expose them.
        width: Math.round(widget.offsetWidth || rect.width / scale),
        height: Math.round(widget.offsetHeight || rect.height / scale)
      }
    });
  };

  const handleDragMouseMove = (e) => {
    if (!dragState.current || !widgetRef.current) return;

    const panel = widgetRef.current.parentElement;
    if (!panel) return;

    const scale = normalizeInteractionScale(interactionScale);
    const dx = (e.clientX - dragState.current.startX) / scale;
    const dy = (e.clientY - dragState.current.startY) / scale;

    const position = getConstrainedPosition(
      panel,
      widgetRef.current,
      dragState.current.left + dx,
      dragState.current.top + dy
    );

    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
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
    const isRecoveryDrag = e.altKey;
    if (!e.target.closest('.widget-header') && !isRecoveryDrag) return;
    if (e.target.closest('.widget-controls')) return;

    const widget = widgetRef.current;
    const panel = widget?.parentElement;
    if (!panel) return;

    const style = window.getComputedStyle(panel);

    if (isRecoveryDrag) {
      e.preventDefault();
      e.stopPropagation();
    }

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
    const { width, height, left, top } = calculateResizeLayout(
      r,
      e.clientX,
      e.clientY,
      interactionScale
    );

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

    const scale = normalizeInteractionScale(interactionScale);
    const rect = widget.getBoundingClientRect();
    const panelStyle = window.getComputedStyle(panel);

    resizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      width: widget.offsetWidth || rect.width / scale,
      height: widget.offsetHeight || rect.height / scale,
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

  useEffect(() => {
    if (!constrainToParent) return undefined;

    const keepHeaderInView = () => {
      const widget = widgetRef.current;
      const panel = widget?.parentElement;
      if (!widget || !panel) return;

      const panelStyle = window.getComputedStyle(panel);
      const left = parseFloat(panelStyle.left) || 0;
      const top = parseFloat(panelStyle.top) || 0;
      const position = getConstrainedPosition(panel, widget, left, top);

      if (position.left === left && position.top === top) return;
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      notifyLayoutChange();
    };

    keepHeaderInView();
    window.addEventListener('resize', keepHeaderInView);
    return () => window.removeEventListener('resize', keepHeaderInView);
  }, [constrainToParent, layoutPosition?.left, layoutPosition?.top]);

  return (
    <div
      ref={widgetRef}
      className={`dockable-widget ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      data-widget-id={id}
      onMouseDown={startDrag}
      title="Drag the header to move. Alt/Option-drag anywhere to recover this widget."
      style={style}
    >
      <div className="widget-header">
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
