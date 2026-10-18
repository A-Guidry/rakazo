// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const voice = vi.hoisted(() => ({
  catalog: vi.fn(),
  credentials: vi.fn(),
  status: vi.fn(),
  voices: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  setVoice: vi.fn(),
  setSpeechModel: vi.fn(),
}));

vi.mock("../lib/rpc", () => ({ rpc: { voice } }));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray) => parts.join("");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@rakazo/ui-web", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({
      variant: _variant,
      size: _size,
      ...props
    }: ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} />,
    Dialog: Container,
    DialogClose: Container,
    DialogContent: Container,
    DialogTitle: Container,
    Field: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    FieldLabel: ({ children, htmlFor }: { children?: ReactNode; htmlFor?: string }) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    Input: (props: ComponentProps<"input">) => <input {...props} />,
    NativeSelect: (props: ComponentProps<"select">) => <select {...props} />,
    NativeSelectOption: (props: ComponentProps<"option">) => <option {...props} />,
  };
});

import { VoiceSettingsOverlay } from "./VoiceSettingsOverlay";

const fish = {
  id: "cred-fish",
  provider: "fish-audio",
  hasKey: true,
  isDefault: true,
  voiceId: "voice-1",
  speechModel: "",
  transcribe: true,
};
const eleven = {
  id: "cred-eleven",
  provider: "elevenlabs",
  hasKey: true,
  isDefault: false,
  voiceId: "rachel",
  speechModel: "",
  transcribe: true,
};

function speechModelInput(container: HTMLElement): HTMLInputElement | undefined {
  return [...container.querySelectorAll("input")].find((input) => {
    const label = container.querySelector(`label[for="${input.id}"]`);
    return label?.textContent === "Speech model";
  });
}

it("saves a Fish speech model on the existing provider pane", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.catalog.mockResolvedValue([
    { id: "fish-audio", name: "Fish Audio", description: "", transcribe: true },
    { id: "elevenlabs", name: "ElevenLabs", description: "", transcribe: true },
  ]);
  voice.credentials.mockResolvedValue([fish, eleven]);
  voice.status.mockResolvedValue({
    configured: true,
    ready: true,
    transcribe: true,
    provider: "fish-audio",
    voiceId: "voice-1",
  });
  voice.voices.mockImplementation(async ({ provider }: { provider?: string }) =>
    provider === "elevenlabs"
      ? [{ id: "rachel", label: "Rachel" }]
      : [{ id: "voice-1", label: "Aria" }],
  );
  voice.setSpeechModel.mockImplementation(async ({ speechModel }: { speechModel: string }) => ({
    ...fish,
    speechModel,
  }));

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) => {
    const found = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes(text),
    );
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  };
  try {
    await act(async () => {
      root.render(<VoiceSettingsOverlay embedded onClose={() => undefined} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const input = speechModelInput(container);
    expect(input).toBeTruthy();
    expect(input?.placeholder).toBe("Optional");

    await act(async () => {
      button("ElevenLabs").click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(speechModelInput(container)).toBeUndefined();

    await act(async () => {
      button("Fish Audio").click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const fishInput = speechModelInput(container);
    if (!fishInput) throw new Error("Missing speech model field");
    await act(async () => {
      fishInput.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(fishInput, "s1");
      fishInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      fishInput.blur();
    });

    expect(voice.setSpeechModel).toHaveBeenCalledWith({
      provider: "fish-audio",
      speechModel: "s1",
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

function labelledInput(container: HTMLElement, text: string): HTMLInputElement {
  const found = [...container.querySelectorAll("input")].find(
    (input) => container.querySelector(`label[for="${input.id}"]`)?.textContent === text,
  );
  if (!found) throw new Error(`Missing field: ${text}`);
  return found;
}

it("connects a self-hosted speech server by URL without a key", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.connect.mockReset();
  voice.catalog.mockResolvedValue([
    { id: "openai-compatible", name: "Self-hosted", description: "", transcribe: true },
  ]);
  voice.credentials.mockResolvedValue([]);
  voice.status.mockResolvedValue({
    configured: false,
    ready: false,
    transcribe: false,
    provider: null,
    voiceId: "",
  });
  voice.connect.mockResolvedValue({
    id: "cred-local",
    provider: "openai-compatible",
    hasKey: true,
    isDefault: true,
    voiceId: "af_heart",
    speechModel: "",
    transcribe: true,
    endpoint: "http://100.64.0.10:8810/v1",
  });

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const type = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const connect = () =>
    [...container.querySelectorAll("button")].find((entry) => entry.textContent === "Connect");
  try {
    await act(async () => {
      root.render(<VoiceSettingsOverlay embedded onClose={() => undefined} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(labelledInput(container, "API key").placeholder).toBe("Optional");
    expect(labelledInput(container, "Speech model").placeholder).toBe(
      "mlx-community/Kokoro-82M-bf16",
    );
    expect(connect()?.disabled).toBe(true);

    await type(labelledInput(container, "Server URL"), " http://100.64.0.10:8810 ");
    expect(connect()?.disabled).toBe(false);
    await act(async () => {
      connect()?.click();
    });

    expect(voice.connect).toHaveBeenCalledWith({
      provider: "openai-compatible",
      apiKey: "",
      voiceId: undefined,
      baseUrl: "http://100.64.0.10:8810",
      ttsModel: undefined,
      sttModel: undefined,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
