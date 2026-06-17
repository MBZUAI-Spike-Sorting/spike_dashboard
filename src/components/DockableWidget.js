import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import './DockableWidget.css';

const WIDGET_BASE_Z_INDEX = 10;
const WIDGET_ACTIVE_Z_INDEX_MIN = 20;
const WIDGET_ACTIVE_Z_INDEX_RANGE = 60;
const WIDGET_TRANSIENT_Z_INDEX = 120;

/**
 * DockableWidget Component
 * 
 * A resizable and draggable widget container for dashboard panels.
 * Supports minimize, maximize, and close actions.
 */
const DockableWidget = ({
  id,
  title,
  children,
  onClose,
  onMinimize,
  onMaximize,
  isMinimized = false,
  isMaximized = false,
  showControls = true,
  className = '',
  resizable = true,
  draggable = true
}) => {
  const [zIndex, setZIndex] = useState(WIDGET_BASE_Z_INDEX);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const contentRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const widgetRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const resizeDataRef = useRef({
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    direction: null
  });
  const dragDataRef = useRef({
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0
  });

  const handleMinimize = (e) => {
    e.stopPropagation();
    if (onMinimize) onMinimize(id);
  };

  const handleMaximize = (e) => {
    e.stopPropagation();
    if (onMaximize) onMaximize(id);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    if (onClose) onClose(id);
  };

  // Handle drag to move
  const handleDragStart = (e) => {
    if (!draggable || isMaximized || isResizingRef.current) return;

    // Only drag from header
    if (!e.target.closest('.widget-header') || e.target.closest('.widget-controls')) return;

    e.preventDefault();
    e.stopPropagation();

    const widget = widgetRef.current;
    if (!widget) return;

    const parent = widget.parentElement;

    // Get the current CSS position values (or default to computed position)
    const computedStyle = window.getComputedStyle(parent);
    let currentLeft = parseFloat(computedStyle.left) || 0;
    let currentTop = parseFloat(computedStyle.top) || 0;

    // If left/top are auto or not set, use the current position
    if (computedStyle.left === 'auto' || isNaN(currentLeft)) {
      const parentRect = parent.getBoundingClientRect();
      const containerRect = parent.parentElement.getBoundingClientRect();
      currentLeft = parentRect.left - containerRect.left;
    }
    if (computedStyle.top === 'auto' || isNaN(currentTop)) {
      const parentRect = parent.getBoundingClientRect();
      const containerRect = parent.parentElement.getBoundingClientRect();
      currentTop = parentRect.top - containerRect.top;
    }

    // Store the offset from cursor to the current position
    dragDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: currentLeft,
      startTop: currentTop
    };

    isDraggingRef.current = true;
    setIsDragging(true);
    setZIndex(WIDGET_TRANSIENT_Z_INDEX);

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e) => {
    if (!isDraggingRef.current) return;
    
    const widget = widgetRef.current;
    if (!widget) return;
    
    const parent = widget.parentElement;
    const { startX, startY, startLeft, startTop } = dragDataRef.current;
    
    // Calculate how much the mouse has moved
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Apply the delta to the starting position
    const newLeft = startLeft + deltaX;
    const newTop = startTop + deltaY;
    
    parent.style.left = `${newLeft}px`;
    parent.style.top = `${newTop}px`;
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    setZIndex(WIDGET_BASE_Z_INDEX);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  // Bring widget to front on click
  const handleWidgetClick = () => {
    if (!isMaximized) {
      setZIndex(WIDGET_ACTIVE_Z_INDEX_MIN + (Date.now() % WIDGET_ACTIVE_Z_INDEX_RANGE));
    }
  };

  // Setup ResizeObserver to notify child components when widget size changes
  useEffect(() => {
    const currentContentRef = contentRef.current;
    
    if (currentContentRef) {
      // Create ResizeObserver to watch for size changes
      resizeObserverRef.current = new ResizeObserver((entries) => {
        for (let entry of entries) {
          // Dispatch a custom event that child components can listen to
          const event = new CustomEvent('widget-resize', {
            detail: {
              widgetId: id,
              width: entry.contentRect.width,
              height: entry.contentRect.height
            }
          });
          entry.target.dispatchEvent(event);
          
          // Also dispatch global resize event for components using window resize listener
          window.dispatchEvent(new Event('resize'));
        }
      });

      resizeObserverRef.current.observe(currentContentRef);
    }

    // Cleanup
    return () => {
      if (resizeObserverRef.current && currentContentRef) {
        resizeObserverRef.current.unobserve(currentContentRef);
        resizeObserverRef.current.disconnect();
      }
    };
  }, [id]);

  // Trigger resize when minimize/maximize state changes
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
    return () => clearTimeout(timer);
  }, [isMinimized, isMaximized]);

  // Handle resize start
  const handleResizeStart = (e, direction) => {
    if (!resizable || isMinimized || isMaximized) return;

    e.preventDefault();
    e.stopPropagation();

    const widget = widgetRef.current;
    if (!widget) return;

    const parent = widget.parentElement;
    const rect = widget.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(parent);

    // Get current position
    let currentLeft = parseFloat(computedStyle.left) || 0;
    let currentTop = parseFloat(computedStyle.top) || 0;

    if (computedStyle.left === 'auto' || isNaN(currentLeft)) {
      const parentRect = parent.getBoundingClientRect();
      const containerRect = parent.parentElement.getBoundingClientRect();
      currentLeft = parentRect.left - containerRect.left;
    }
    if (computedStyle.top === 'auto' || isNaN(currentTop)) {
      const parentRect = parent.getBoundingClientRect();
      const containerRect = parent.parentElement.getBoundingClientRect();
      currentTop = parentRect.top - containerRect.top;
    }

    resizeDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      startLeft: currentLeft,
      startTop: currentTop,
      direction
    };

    isResizingRef.current = true;
    setIsResizing(true);

    // Add will-change hints for better performance
    parent.style.willChange = 'left, top';
    widget.style.willChange = 'width, height';

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  // Handle resize move
  const handleResizeMove = (e) => {
    if (!isResizingRef.current) return;

    const widget = widgetRef.current;
    if (!widget) return;

    const parent = widget.parentElement;
    const { startX, startY, startWidth, startHeight, startLeft, startTop, direction } = resizeDataRef.current;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newWidth = startWidth;
    let newHeight = startHeight;
    let newLeft = startLeft;
    let newTop = startTop;

    // Handle horizontal resizing
    if (direction.includes('e')) {
      // Resize from right edge - keep left edge fixed
      newWidth = Math.max(200, startWidth + deltaX);
    } else if (direction.includes('w')) {
      // Resize from left edge - keep right edge fixed
      const attemptedWidth = startWidth - deltaX;
      if (attemptedWidth >= 200) {
        // Normal resize
        newWidth = attemptedWidth;
        newLeft = startLeft + deltaX;
      } else {
        // Clamped to minimum - keep right edge at same position
        newWidth = 200;
        newLeft = startLeft + startWidth - 200;
      }
    }

    // Handle vertical resizing
    if (direction.includes('s')) {
      // Resize from bottom edge - keep top edge fixed
      newHeight = Math.max(150, startHeight + deltaY);
    } else if (direction.includes('n')) {
      // Resize from top edge - keep bottom edge fixed
      const attemptedHeight = startHeight - deltaY;
      if (attemptedHeight >= 150) {
        // Normal resize
        newHeight = attemptedHeight;
        newTop = startTop + deltaY;
      } else {
        // Clamped to minimum - keep bottom edge at same position
        newHeight = 150;
        newTop = startTop + startHeight - 150;
      }
    }

    // Batch DOM updates using will-change and transform for smoother animation
    // Update position properties
    if (direction.includes('w')) {
      parent.style.left = `${newLeft}px`;
    }
    if (direction.includes('n')) {
      parent.style.top = `${newTop}px`;
    }

    // Update size properties in one batch
    widget.style.width = `${newWidth}px`;
    widget.style.height = `${newHeight}px`;
    widget.style.flex = 'none';
  };

  // Handle resize end
  const handleResizeEnd = () => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);

    const widget = widgetRef.current;
    if (widget) {
      const parent = widget.parentElement;
      // Remove will-change hints after resize completes
      parent.style.willChange = 'auto';
      widget.style.willChange = 'auto';
    }

    // Trigger resize event for content
    window.dispatchEvent(new Event('resize'));
  };

  return (
    <div
      ref={widgetRef}
      className={`dockable-widget ${className} ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      data-widget-id={id}
      style={{
        zIndex: isMaximized || isDragging || isResizing
          ? WIDGET_TRANSIENT_Z_INDEX
          : zIndex
      }}
      onClick={handleWidgetClick}
    >
      {showControls && (
        <div 
          className="widget-header"
          onMouseDown={handleDragStart}
        >
          <div className="widget-title">{title}</div>
          <div className="widget-controls">
            {!isMaximized && (
              <button
                className="widget-control-btn minimize-btn"
                onClick={handleMinimize}
                title={isMinimized ? "Restore" : "Minimize"}
              >
                {isMinimized ? '▫' : '−'}
              </button>
            )}
            <button
              className="widget-control-btn maximize-btn"
              onClick={handleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? '❐' : '□'}
            </button>
            <button
              className="widget-control-btn close-btn"
              onClick={handleClose}
              title="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div 
        ref={contentRef}
        className={`widget-content ${isMinimized ? 'hidden' : ''}`}
      >
        {children}
      </div>
      
      {/* Resize handles */}
      {resizable && !isMinimized && !isMaximized && (
        <>
          <div className="widget-resize-handle widget-resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
          <div className="widget-resize-handle widget-resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
          <div className="widget-resize-handle widget-resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
          <div className="widget-resize-handle widget-resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
          <div className="widget-resize-handle widget-resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
          <div className="widget-resize-handle widget-resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
          <div className="widget-resize-handle widget-resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="widget-resize-handle widget-resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
        </>
      )}
    </div>
  );
};

DockableWidget.propTypes = {
  /** Unique identifier for the widget */
  id: PropTypes.string.isRequired,
  /** Widget title displayed in header */
  title: PropTypes.string.isRequired,
  /** Widget content */
  children: PropTypes.node,
  /** Callback when close button is clicked */
  onClose: PropTypes.func,
  /** Callback when minimize button is clicked */
  onMinimize: PropTypes.func,
  /** Callback when maximize button is clicked */
  onMaximize: PropTypes.func,
  /** Whether widget is currently minimized */
  isMinimized: PropTypes.bool,
  /** Whether widget is currently maximized */
  isMaximized: PropTypes.bool,
  /** Whether to show window control buttons */
  showControls: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Whether widget can be resized */
  resizable: PropTypes.bool,
  /** Whether widget can be dragged */
  draggable: PropTypes.bool,
};

DockableWidget.defaultProps = {
  children: null,
  onClose: null,
  onMinimize: null,
  onMaximize: null,
  isMinimized: false,
  isMaximized: false,
  showControls: true,
  className: '',
  resizable: true,
  draggable: true,
};

export default DockableWidget;
