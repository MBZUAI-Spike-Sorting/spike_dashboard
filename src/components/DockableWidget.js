import React, { useState, useRef, useEffect } from 'react';
import './DockableWidget.css';

export const normalizeInteractionScale = (scale) => {
  const numericScale = Number(scale);
  return Number.isFinite(numericScale) && numericScale > 0 ? numericScale : 1;
};

export const WIDGET_DRAG_THRESHOLD = 4;

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
  style = {},
  isLoading = false,
  loadingLabel = 'Updating…',
  isSelected = false,
  isGroupDragging = false,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd
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
    const screenDx = e.clientX - dragState.current.startX;
    const screenDy = e.clientY - dragState.current.startY;
    if (!dragState.current.hasMoved) {
      if (Math.max(Math.abs(screenDx), Math.abs(screenDy)) < WIDGET_DRAG_THRESHOLD) {
        return;
      }
      dragState.current.hasMoved = true;
      onDragStart?.(id);
      setIsDragging(true);
    }
    const dx = screenDx / scale;
    const dy = screenDy / scale;

    const position = getConstrainedPosition(
      panel,
      widgetRef.current,
      dragState.current.left + dx,
      dragState.current.top + dy
    );

    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    onDragMove?.(id, {
      delta: { x: dx, y: dy },
      position
    });
  };

  const handleDragMouseUp = (event) => {
    const drag = dragState.current;
    if (!drag) return;
    const moved = Boolean(drag.hasMoved);
    const cancelled = event?.type === 'blur';
    const handledByParent = onDragEnd?.(id, { moved, cancelled }) === true;
    dragState.current = null;
    setIsDragging(false);
    document.removeEventListener('mousemove', handleDragMouseMove);
    document.removeEventListener('mouseup', handleDragMouseUp);
    window.removeEventListener('blur', handleDragMouseUp);
    if (moved && !cancelled && !handledByParent) {
      notifyLayoutChange();
    }
  };

  const startDrag = (e) => {
    if (e.button !== 0) return;
    const isRecoveryDrag = e.altKey;
    const isHeaderInteraction = Boolean(e.target.closest('.widget-header'));
    if (!isHeaderInteraction && !isRecoveryDrag) return;
    if (e.target.closest('.widget-controls')) return;

    const isAdditiveSelection = isHeaderInteraction && (e.ctrlKey || e.metaKey);
    onSelect?.(id, { additive: isAdditiveSelection });

    // Modifier-click is reserved for toggling widget selection. Release the
    // modifier before dragging any selected header to move the full group.
    if (isAdditiveSelection) {
      e.preventDefault();
      return;
    }
    if (!draggable || isMaximized) return;

    const widget = widgetRef.current;
    const panel = widget?.parentElement;
    if (!panel) return;

    const style = window.getComputedStyle(panel);

    e.preventDefault();
    if (isRecoveryDrag) {
      e.stopPropagation();
    }

    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
      hasMoved: false
    };

    document.addEventListener('mousemove', handleDragMouseMove);
    document.addEventListener('mouseup', handleDragMouseUp);
    window.addEventListener('blur', handleDragMouseUp);
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
      window.removeEventListener('blur', handleDragMouseUp);
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, []);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || typeof ResizeObserver === 'undefined') return undefined;

    let animationFrame = null;
    const observer = new ResizeObserver(() => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        // Plotly's responsive handler listens to window resize rather than
        // arbitrary parent-element changes. Forward the dock resize so plots
        // and other responsive children recompute their dimensions.
        window.dispatchEvent(new Event('resize'));
        animationFrame = null;
      });
    });

    observer.observe(widget);
    return () => {
      observer.disconnect();
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
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
      className={`dockable-widget ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isGroupDragging ? 'group-dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      data-widget-id={id}
      data-widget-selected={isSelected ? 'true' : 'false'}
      onMouseDown={startDrag}
      title="Drag the header to move. Ctrl/Cmd-click the header for multi-selection. Alt/Option-drag anywhere to recover this widget."
      style={style}
    >
      <div className="widget-header">
        <div className="widget-title">{title}</div>

        <div className="widget-controls">
          <button
            className="widget-control-btn"
            aria-label={`${isMinimized ? 'Restore' : 'Minimize'} ${title}`}
            title={isMinimized ? `Restore ${title}` : `Minimize ${title}`}
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
            aria-label={`${isMaximized ? 'Restore' : 'Maximize'} ${title}`}
            title={isMaximized ? `Restore ${title}` : `Maximize ${title}`}
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
            aria-label={`Close ${title}`}
            title={`Close ${title}`}
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

      <div
        className={`widget-content ${isMinimized ? 'hidden' : ''}`}
        aria-hidden={isMinimized}
      >
        {children}
      </div>

      {!isMinimized && isLoading && (
        <div className="widget-loading-overlay" role="status" aria-live="polite">
          <span className="widget-loading-spinner" aria-hidden="true" />
          <span>{loadingLabel || 'Updating…'}</span>
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
