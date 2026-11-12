import React, { useEffect, useId, useMemo, useRef, useState } from "react";

const VIEW = {
  width: 740,
  height: 258,
  left: 55,
  right: 18,
  top: 24,
  bottom: 38,
};
const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
const shortPeso = (value) =>
  `₱${value >= 1_000_000 ? `${Number((value / 1_000_000).toFixed(1))}m` : value >= 1_000 ? `${Number((value / 1_000).toFixed(1))}k` : Number(value.toFixed(value < 10 ? 1 : 0))}`;
const safeAmount = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

function smoothPath(points) {
  if (!points.length) return "";
  return points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export default function RevenueChart({ revenue, loading = false }) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState(null);
  const [chartWidth, setChartWidth] = useState(VIEW.width);
  const chartRef = useRef(null);
  const pointRefs = useRef([]);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return undefined;
    const measure = () =>
      setChartWidth(
        Math.max(220, Math.round(element.getBoundingClientRect().width)),
      );
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const model = useMemo(() => {
    const labels = Array.isArray(revenue?.labels) ? revenue.labels : [];
    const current = labels.map((_, index) =>
      safeAmount(revenue?.current?.[index]),
    );
    const previous = labels.map((_, index) =>
      safeAmount(revenue?.previous?.[index]),
    );
    const maximum = Math.max(1, ...current, ...previous);
    const magnitude = 10 ** Math.floor(Math.log10(maximum));
    const ceiling =
      Math.ceil((maximum * 1.12) / (magnitude / 2)) * (magnitude / 2);
    const width = chartWidth - VIEW.left - VIEW.right;
    const baseline = VIEW.height - VIEW.bottom;
    const height = baseline - VIEW.top;
    const mapPoints = (values) =>
      values.map((value, index) => ({
        x:
          labels.length === 1
            ? VIEW.left + width / 2
            : VIEW.left + (index / Math.max(1, labels.length - 1)) * width,
        y: baseline - (value / ceiling) * height,
        value,
        label: labels[index],
      }));
    const points = mapPoints(current);
    const previousPoints = mapPoints(previous);
    const path = smoothPath(points);
    const area = points.length
      ? `${path} L ${points.at(-1).x} ${baseline} L ${points[0].x} ${baseline} Z`
      : "";
    const ticks = Array.from({ length: 5 }, (_, index) => ({
      value: (ceiling * (4 - index)) / 4,
      y: VIEW.top + (index * height) / 4,
    }));
    const labelIndexes = (desired) => {
      const count = Math.min(labels.length, desired);
      return new Set(
        Array.from({ length: count }, (_, index) =>
          Math.round((index * (labels.length - 1)) / Math.max(1, count - 1)),
        ),
      );
    };
    return {
      points,
      previousPoints,
      path,
      area,
      ticks,
      baseline,
      width,
      desktopLabels: labelIndexes(7),
      mobileLabels: labelIndexes(4),
    };
  }, [revenue, chartWidth]);

  const selected = active == null ? null : model.points[active];
  const moveFocus = (event, index) => {
    let next = index;
    if (event.key === "ArrowRight")
      next = Math.min(model.points.length - 1, index + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = model.points.length - 1;
    else if (event.key === "Escape") {
      setActive(null);
      return;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActive(index);
      return;
    } else return;
    event.preventDefault();
    pointRefs.current[next]?.focus();
    setActive(next);
  };

  return (
    <div
      ref={chartRef}
      className={`revenue-chart ${loading ? "is-loading" : ""}`}
      aria-busy={loading}
    >
      {loading ? (
        <div
          className="revenue-chart-loading"
          role="status"
          aria-label="Loading revenue data"
        >
          <div className="revenue-chart-loading-axis">
            {[1, 2, 3, 4, 5].map((value) => (
              <i key={value} />
            ))}
          </div>
          <div className="revenue-chart-loading-grid">
            {[1, 2, 3, 4, 5].map((value) => (
              <span key={value} />
            ))}
          </div>
          <div className="revenue-chart-loading-wave" />
          <div className="revenue-chart-loading-labels">
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <i key={value} />
            ))}
          </div>
          <span className="revenue-chart-sr-only">Loading revenue data</span>
        </div>
      ) : model.points.length ? (
        <div
          className="revenue-chart-plot"
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActive(null);
          }}
        >
          <svg
            className="revenue-chart-svg"
            viewBox={`0 0 ${chartWidth} ${VIEW.height}`}
            preserveAspectRatio="none"
            aria-label="Revenue compared with the previous period"
            role="group"
          >
            <defs>
              <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3875f6" stopOpacity=".18" />
                <stop offset="100%" stopColor="#3875f6" stopOpacity=".015" />
              </linearGradient>
              <linearGradient id={`${id}-line`} x1="0" x2="1">
                <stop offset="0%" stopColor="#6894f9" />
                <stop offset="55%" stopColor="#2865ed" />
                <stop offset="100%" stopColor="#1151da" />
              </linearGradient>
            </defs>
            {model.ticks.map(({ value, y }) => (
              <g key={y} className="revenue-chart-grid">
                <text x={VIEW.left - 13} y={y + 4} textAnchor="end">
                  {shortPeso(value)}
                </text>
                <line
                  x1={VIEW.left}
                  x2={chartWidth - VIEW.right}
                  y1={y}
                  y2={y}
                />
              </g>
            ))}
            <path
              className="revenue-chart-area"
              d={model.area}
              fill={`url(#${id}-area)`}
            />
            <path
              className="revenue-chart-previous"
              d={smoothPath(model.previousPoints)}
              fill="none"
            />
            <path
              className="revenue-chart-current"
              d={model.path}
              fill="none"
              stroke={`url(#${id}-line)`}
              pathLength="1"
            />
            {model.points.length === 1 && (
              <circle
                cx={model.points[0].x}
                cy={model.points[0].y}
                r="4"
                fill="#2865ed"
              />
            )}
            {model.points.map((point, index) => {
              const last = index === model.points.length - 1;
              const desktopLabel = model.desktopLabels.has(index);
              const mobileLabel = model.mobileLabels.has(index);
              return (
                <g key={`${point.label}-${index}`}>
                  <text
                    className={`revenue-chart-x-label ${desktopLabel ? "show-desktop" : ""} ${mobileLabel ? "show-mobile" : ""}`}
                    x={point.x}
                    y={VIEW.height - 9}
                    textAnchor={index === 0 ? "start" : last ? "end" : "middle"}
                  >
                    {point.label}
                  </text>
                  <rect
                    ref={(element) => {
                      pointRefs.current[index] = element;
                    }}
                    x={
                      point.x -
                      Math.max(
                        10,
                        model.width / Math.max(2, model.points.length - 1) / 2,
                      )
                    }
                    y={VIEW.top}
                    width={Math.max(
                      20,
                      model.width / Math.max(2, model.points.length - 1),
                    )}
                    height={model.baseline - VIEW.top}
                    fill="transparent"
                    className="revenue-chart-point-target"
                    tabIndex="0"
                    role="button"
                    aria-label={`${point.label}: ${peso.format(point.value)} revenue, ${peso.format(model.previousPoints[index]?.value || 0)} previous period`}
                    onPointerEnter={() => setActive(index)}
                    onPointerDown={() => setActive(index)}
                    onClick={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    onKeyDown={(event) => moveFocus(event, index)}
                  />
                </g>
              );
            })}
            {selected && (
              <g className="revenue-chart-highlight" aria-hidden="true">
                <line
                  x1={selected.x}
                  x2={selected.x}
                  y1={VIEW.top}
                  y2={model.baseline}
                />
                <circle
                  className="revenue-chart-point-glow"
                  cx={selected.x}
                  cy={selected.y}
                  r="11"
                />
                <circle
                  className="revenue-chart-point"
                  cx={selected.x}
                  cy={selected.y}
                  r="5"
                />
              </g>
            )}
          </svg>
          {selected && (
            <div
              className="revenue-chart-tooltip"
              role="status"
              style={{
                left: `${Math.max(20, Math.min(80, (selected.x / chartWidth) * 100))}%`,
                top: `${Math.max(4, Math.min(59, (selected.y / VIEW.height) * 100 - 23))}%`,
              }}
            >
              <span>{selected.label}</span>
              <strong>{peso.format(selected.value)}</strong>
              <small>
                <i />
                Revenue
              </small>
            </div>
          )}
        </div>
      ) : (
        <div className="revenue-chart-empty">
          Your revenue trend will appear here.
        </div>
      )}
      <div className="revenue-chart-legend">
        <span>
          <i className="revenue-chart-legend-current" />
          Revenue
        </span>
        <span>
          <i className="revenue-chart-legend-previous" />
          Previous period
        </span>
      </div>
    </div>
  );
}
