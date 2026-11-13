import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentExperience } from "@/components/student-experience";
import { apiFetch } from "@/lib/client/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/firebase/client", () => ({
  isFirebaseConfigured: true,
  getIdToken: vi.fn().mockResolvedValue("token"),
  signOutParticipant: vi.fn(),
  uploadWav: vi.fn(),
}));
vi.mock("@/lib/client/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client/api")>()),
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/client/offline-audio", () => ({
  listPendingAudio: vi.fn().mockResolvedValue([]),
  savePendingAudio: vi.fn(),
  deletePendingAudio: vi.fn(),
}));

beforeEach(() => {
  sessionStorage.setItem("olaf-participant-code", "S-001");
  Element.prototype.scrollIntoView = vi.fn();
});

describe("StudentExperience", () => {
  it("shows why the diary could not open instead of loading forever", async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new Error("The participant's experiment is not active."),
    );

    render(<StudentExperience />);

    expect(
      await screen.findByText("The participant's experiment is not active."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試一次" })).toBeInTheDocument();
    expect(screen.queryByText("正在打開冒險日記…")).not.toBeInTheDocument();
  });
});
