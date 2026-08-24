import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BatchStatusBadge, ReviewBadge, ValidationBadge } from "./badges";

describe("badges", () => {
  it("renders human labels for each status", () => {
    render(
      <>
        <ValidationBadge status="invalid" />
        <ReviewBadge status="needs_review" />
        <BatchStatusBadge status="completed_with_issues" />
      </>,
    );
    expect(screen.getByText("Invalid")).toHaveClass("badge--val-invalid");
    expect(screen.getByText("Needs Review")).toHaveClass("badge--rev-needs_review");
    expect(screen.getByText("Completed with Issues")).toBeInTheDocument();
  });
});
