import React, { useMemo } from 'react';
import { createCanvasMinimapModel } from '../utils/canvasMinimap';

const CanvasMinimap = ({
  viewport,
  widgets,
  isVisible,
  alwaysVisible,
  onAlwaysVisibleChange,
  onActivity,
}) => {
  const model = useMemo(() => createCanvasMinimapModel({
    viewport,
    widgets,
  }), [viewport, widgets]);

  return (
    <aside
      className={`canvas-minimap ${isVisible || alwaysVisible ? 'is-visible' : ''}`}
      aria-label="Canvas minimap"
      onMouseEnter={onActivity}
    >
      <div className="canvas-minimap-title">
        <span>Canvas map</span>
        <span className="canvas-minimap-coordinates">
          {Math.round(viewport.x)}, {Math.round(viewport.y)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        role="img"
        aria-label="Widget positions and current canvas view"
      >
        <rect
          className="canvas-minimap-world"
          x="0.5"
          y="0.5"
          width={model.width - 1}
          height={model.height - 1}
          rx="5"
        />
        {model.widgets.map((widget, index) => (
          <rect
            className="canvas-minimap-widget"
            key={widget.id || index}
            x={widget.x}
            y={widget.y}
            width={widget.width}
            height={widget.height}
            rx="2"
          />
        ))}
        <rect
          className="canvas-minimap-viewport"
          x={model.viewport.x}
          y={model.viewport.y}
          width={model.viewport.width}
          height={model.viewport.height}
          rx="2"
        />
      </svg>
      <label className="canvas-minimap-persistence">
        <input
          type="checkbox"
          checked={alwaysVisible}
          onChange={(event) => onAlwaysVisibleChange?.(event.target.checked)}
        />
        Always show
      </label>
    </aside>
  );
};

export default CanvasMinimap;
