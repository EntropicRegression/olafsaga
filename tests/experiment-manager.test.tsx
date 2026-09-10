import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExperimentManager } from "@/components/experiment-manager";

describe("researcher experiment workflow", () => {
  it("renders a demo batch and keeps lifecycle mutations local", () => {
    const onNotice = vi.fn();
    render(<ExperimentManager demo onNotice={onNotice} />);
    expect(screen.getByText("EXPERIMENT BATCHES")).toBeInTheDocument();
    expect(screen.getAllByText("SPRING-2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /new batch/i }));
    expect(screen.getAllByText("Create draft").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onNotice).toHaveBeenCalledWith("Demo mode does not change experiment lifecycle state.");
  });
});
