import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  LabelList,
} from "recharts";

function TimeManagementChart({ timingData = [] }) {
  const IDEAL_MAX_SECONDS = 120;

  const averageTime = useMemo(() => {
    if (!timingData.length) return 0;
    const totalTime = timingData.reduce(
      (sum, item) => sum + (Number(item.timeInSeconds) || 0),
      0
    );
    return Math.round(totalTime / timingData.length);
  }, [timingData]);

  const hasData = timingData.length > 0;
  const chartColors = {
    bar: "hsl(var(--primary))",
    ideal: "hsl(var(--primary))",
    average: "hsl(var(--destructive))",
    axis: "hsl(var(--muted-foreground))",
    grid: "hsl(var(--border))",
  };

  return (
    <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
      <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">
        Time Management
      </h4>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">No timing data available.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full border border-border bg-background text-foreground">
              Ideal Max: <span className="font-semibold">{IDEAL_MAX_SECONDS}s</span>
            </span>
            <span className="px-2.5 py-1 rounded-full border border-border bg-background text-foreground">
              Your Average: <span className="font-semibold">{averageTime}s</span>
            </span>
          </div>

          <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={timingData}
              margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.6} />
              <XAxis
                dataKey="question"
                tick={{ fontSize: 12, fill: chartColors.axis }}
                axisLine={{ stroke: chartColors.axis, opacity: 0.4 }}
                tickLine={{ stroke: chartColors.axis, opacity: 0.4 }}
              />
              <YAxis
                tickFormatter={(value) => `${value}s`}
                tick={{ fontSize: 12, fill: chartColors.axis }}
                axisLine={{ stroke: chartColors.axis, opacity: 0.4 }}
                tickLine={{ stroke: chartColors.axis, opacity: 0.4 }}
              />
              <Tooltip
                formatter={(value) => [`${value} Seconds`, "Time Spent"]}
                labelFormatter={(label) => `Question: ${label}`}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Legend />

              <ReferenceLine
                y={IDEAL_MAX_SECONDS}
                stroke={chartColors.ideal}
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: `Ideal Max (${IDEAL_MAX_SECONDS}s)`,
                  position: "insideTopRight",
                  fill: chartColors.ideal,
                  fontSize: 12,
                }}
              />

              <ReferenceLine
                y={averageTime}
                stroke={chartColors.average}
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: `Your Average (${averageTime}s)`,
                  position: "insideTopLeft",
                  fill: chartColors.average,
                  fontSize: 12,
                }}
              />

              <Bar
                dataKey="timeInSeconds"
                name="Time Spent (Seconds)"
                fill={chartColors.bar}
                radius={[6, 6, 0, 0]}
              >
                <LabelList
                  dataKey="timeInSeconds"
                  position="top"
                  formatter={(value) => `${value}s`}
                  style={{ fill: chartColors.axis, fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default TimeManagementChart;
