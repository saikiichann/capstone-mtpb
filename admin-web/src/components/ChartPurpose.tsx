// What a chart is for, in one line under its title (survey feedback:
// "Purpose of the graph"). Same look on every dashboard.
import { Info } from "lucide-react";
import "./ChartPurpose.css";

export default function ChartPurpose({ children }: { children: React.ReactNode }) {
  return (
    <p className="chart-purpose">
      <Info size={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
