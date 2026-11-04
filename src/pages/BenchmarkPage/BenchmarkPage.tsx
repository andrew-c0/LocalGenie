import { Outlet } from "react-router-dom";
import "./BenchmarkPage.css";

/**
 * Frame for the benchmark sub-pages (`/benchmarks/prompts` and the rest): the page padding and scrolling
 * every page has. The landing at `/benchmarks` sits outside it, so its padding is not doubled.
 */
export default function BenchmarkPage() {
  return (
    <div className="benchmark-page__page">
      <Outlet />
    </div>
  );
}
