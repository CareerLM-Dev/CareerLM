import React, { useState } from "react";

const LEVEL_MAP = {
  Strong: 1,
  Solid: 0.75,
  Growing: 0.5,
  "Needs Work": 0.25,
};

const AXIS_ANGLES = [0, 90, 180, 270];
const AXIS_LABELS = ["Resume", "Project Deep Dive", "Technical", "Behavioral"];
const LEVEL_LABELS = ["Needs Work", "Growing", "Solid", "Strong"];

const getPoint = (angle, scale) => {
  const rad = (angle - 90) * Math.PI / 180;
  const x = 100 + Math.cos(rad) * 70 * scale;
  const y = 100 + Math.sin(rad) * 70 * scale;
  return { x, y };
};

function StagePerformanceRadar({ stagePerformance }) {
  const [radarHover, setRadarHover] = useState(null);

  if (!stagePerformance) return null;

  const stageValues = [
    stagePerformance.resume_validation,
    stagePerformance.project_deep_dive,
    stagePerformance.core_technical,
    stagePerformance.behavioral,
  ];

  const numericValues = stageValues.map((stage) => LEVEL_MAP[stage] || 0.25);

  return (
    <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 px-6 py-4 border-b border-border">
        <h3 className="text-xl font-bold flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <span>Stage Performance</span>
        </h3>
      </div>

      <div className="p-6 overflow-x-auto">
        <div className="mx-auto w-full min-w-[420px] max-w-[620px]">
          <div className="relative h-[360px]">
            <svg
              viewBox="-70 -14 340 238"
              className="w-full h-full"
              onMouseLeave={() => setRadarHover(null)}
            >
              {[0.25, 0.5, 0.75, 1].map((scale, index) => (
                <g key={scale}>
                  <polygon
                    points={AXIS_ANGLES.map((angle) => {
                      const point = getPoint(angle, scale);
                      return `${point.x},${point.y}`;
                    }).join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeDasharray={index < 3 ? "4 2" : "0"}
                    className="text-border"
                  />

                </g>
              ))}

              {AXIS_ANGLES.map((angle) => {
                const point = getPoint(angle, 1);
                return (
                  <line
                    key={`axis-${angle}`}
                    x1="100"
                    y1="100"
                    x2={point.x}
                    y2={point.y}
                    stroke="currentColor"
                    strokeWidth="1.2"
                    className="text-border"
                  />
                );
              })}

              <polygon
                points={AXIS_ANGLES.map((angle, index) => {
                  const point = getPoint(angle, numericValues[index]);
                  return `${point.x},${point.y}`;
                }).join(" ")}
                fill="currentColor"
                fillOpacity="0.25"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-primary"
              />

              {AXIS_ANGLES.map((angle, index) => {
                const point = getPoint(angle, numericValues[index]);
                return (
                  <circle
                    key={`point-${angle}`}
                    cx={point.x}
                    cy={point.y}
                    r="6"
                    fill="currentColor"
                    className="text-primary cursor-pointer"
                    onMouseEnter={(event) => {
                      const rect = event.target.ownerSVGElement.getBoundingClientRect();
                      setRadarHover({
                        label: AXIS_LABELS[index],
                        value: stageValues[index],
                        x: event.clientX - rect.left,
                        y: event.clientY - rect.top,
                      });
                    }}
                  />
                );
              })}

              <text x="100" y="5" textAnchor="middle" className="fill-foreground text-xs font-semibold">Resume</text>
              <text x="178" y="104" textAnchor="start" className="fill-foreground text-xs font-semibold">Project Deep Dive</text>
              <text x="100" y="206" textAnchor="middle" className="fill-foreground text-xs font-semibold">Technical</text>
              <text x="22" y="104" textAnchor="end" className="fill-foreground text-xs font-semibold">Behavioral</text>
            </svg>

            {radarHover && (
              <div
                className="absolute pointer-events-none bg-popover border border-border rounded-lg px-3 py-2 shadow-lg z-10 text-sm"
                style={{
                  left: Math.min(Math.max(radarHover.x + 12, 8), 360),
                  top: Math.min(Math.max(radarHover.y - 34, 8), 320),
                }}
              >
                <div className="font-semibold text-foreground">{radarHover.label}</div>
                <div className="text-primary font-bold">{radarHover.value}</div>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Strong (100%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-muted-foreground">Solid (75%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="text-muted-foreground">Growing (50%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-400" />
              <span className="text-muted-foreground">Needs Work (25%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StagePerformanceRadar;