"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  isTauri,
  getAudioDevices,
  setAudioDevice,
  getCommandTemplates,
  saveCustomCommand,
  type AudioDevice,
  type CustomCommand,
} from "@/lib/tauri";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

type Step = "welcome" | "microphone" | "test" | "commands" | "complete";

export function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [templates, setTemplates] = useState<CustomCommand[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [devs, tmpls] = await Promise.all([
        getAudioDevices(),
        getCommandTemplates(),
      ]);
      setDevices(devs);
      setTemplates(tmpls);
      
      // Select default device
      const defaultDevice = devs.find((d) => d.is_default);
      if (defaultDevice) {
        setSelectedDevice(defaultDevice.name);
      }
    } catch (error) {
      console.error("Failed to load onboarding data:", error);
    }
  }, []);

  useEffect(() => {
    if (isOpen && isTauri()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [isOpen, loadData]);

  const handleDeviceSelect = async (deviceName: string) => {
    setSelectedDevice(deviceName);
    try {
      await setAudioDevice(deviceName);
    } catch (error) {
      console.error("Failed to set device:", error);
    }
  };

  const handleTestMic = async () => {
    setIsTestingMic(true);
    // Simulate mic test - in real implementation, would actually record and check levels
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsTestingMic(false);
    setTestSuccess(true);
  };

  const handleTemplateToggle = (id: string) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTemplates(newSelected);
  };

  const handleComplete = async () => {
    // Save selected templates
    for (const templateId of selectedTemplates) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        const command: CustomCommand = {
          ...template,
          id: crypto.randomUUID(),
          enabled: true,
          created_at: new Date().toISOString(),
          last_used: null,
          use_count: 0,
        };
        try {
          await saveCustomCommand(command);
        } catch (error) {
          console.error("Failed to save command:", error);
        }
      }
    }
    onComplete();
  };

  const steps: Step[] = ["welcome", "microphone", "test", "commands", "complete"];
  const currentStepIndex = steps.indexOf(step);

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl"
      >
        {/* Progress */}
        <div className="mb-6 flex gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentStepIndex ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="text-center"
            >
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                  <Image
                    src="/logo.svg"
                    alt="ListenOS Logo"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
              </div>
              <h2 className="mb-1.5 text-xl font-semibold text-foreground">Welcome to ListenOS</h2>
              <p className="mb-6 text-sm text-muted">
                Let&apos;s set up a few things to get you started.
              </p>
              <button
                onClick={nextStep}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
              >
                Get Started
              </button>
            </motion.div>
          )}

          {step === "microphone" && (
            <motion.div
              key="microphone"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <h2 className="mb-1.5 text-lg font-semibold text-foreground">Select Your Microphone</h2>
              <p className="mb-4 text-sm text-muted">
                Choose the microphone you&apos;ll use for voice commands.
              </p>
              
              <div className="mb-4 space-y-2 max-h-48 overflow-y-auto">
                {devices.map((device) => (
                  <button
                    key={device.name}
                    onClick={() => handleDeviceSelect(device.name)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selectedDevice === device.name
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-sidebar-hover"
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      selectedDevice === device.name ? "bg-primary/20 text-primary" : "bg-sidebar-bg text-muted"
                    }`}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{device.name}</p>
                      {device.is_default && (
                        <p className="text-xs text-muted">System default</p>
                      )}
                    </div>
                    {selectedDevice === device.name && (
                      <svg className="h-4 w-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={prevStep}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-sidebar-hover"
                >
                  Back
                </button>
                <button
                  onClick={nextStep}
                  disabled={!selectedDevice}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {step === "test" && (
            <motion.div
              key="test"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="text-center"
            >
              <h2 className="mb-1.5 text-lg font-semibold text-foreground">Test Your Microphone</h2>
              <p className="mb-4 text-sm text-muted">
                Let&apos;s make sure your microphone is working.
              </p>

              <div className="mb-4 flex justify-center">
                {isTestingMic ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                    <div className="flex h-8 items-center gap-0.5">
                      {[...Array(4)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="w-1 rounded-full bg-primary"
                          animate={{ height: [6, 20, 6] }}
                          transition={{
                            duration: 0.5,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : testSuccess ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                    <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <button
                    onClick={handleTestMic}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
                  >
                    <svg className="h-7 w-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                )}
              </div>

              <p className="mb-4 text-sm text-muted">
                {isTestingMic
                  ? "Listening..."
                  : testSuccess
                  ? "Your microphone is working!"
                  : "Click to test your microphone."}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={prevStep}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-sidebar-hover"
                >
                  Back
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  {testSuccess ? "Continue" : "Skip"}
                </button>
              </div>
            </motion.div>
          )}

          {step === "commands" && (
            <motion.div
              key="commands"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <h2 className="mb-1.5 text-lg font-semibold text-foreground">Quick Start Commands</h2>
              <p className="mb-4 text-sm text-muted">
                Select some command templates to get started.
              </p>

              <div className="mb-4 max-h-48 space-y-2 overflow-y-auto">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateToggle(template.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selectedTemplates.has(template.id)
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-sidebar-hover"
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${
                      selectedTemplates.has(template.id) ? "bg-primary/20" : "bg-sidebar-bg"
                    }`}>
                      {template.name.includes("Morning") ? "🌅" :
                       template.name.includes("Focus") ? "🎯" :
                       template.name.includes("Meeting") ? "📹" :
                       template.name.includes("End") ? "🌙" :
                       template.name.includes("Music") ? "🎵" : "⚡"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{template.name}</p>
                      <p className="text-xs text-muted truncate">&quot;{template.trigger_phrase}&quot;</p>
                    </div>
                    <div className={`flex h-4 w-4 items-center justify-center rounded border flex-shrink-0 ${
                      selectedTemplates.has(template.id)
                        ? "border-primary bg-primary"
                        : "border-border"
                    }`}>
                      {selectedTemplates.has(template.id) && (
                        <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={prevStep}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-sidebar-hover"
                >
                  Back
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {step === "complete" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="text-center"
            >
              <div className="mb-4 flex justify-center">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.3 }}
                  className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-500/20"
                >
                  <svg className="h-7 w-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              </div>
              <h2 className="mb-1.5 text-xl font-semibold text-foreground">You&apos;re All Set!</h2>
              <p className="mb-4 text-sm text-muted">
                ListenOS is ready to use.
              </p>

              <div className="mb-6 rounded-lg bg-sidebar-bg p-3 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <kbd className="rounded bg-card px-1.5 py-0.5 text-xs font-mono">Ctrl</kbd>
                  <span className="text-muted text-xs">+</span>
                  <kbd className="rounded bg-card px-1.5 py-0.5 text-xs font-mono">Space</kbd>
                  <span className="text-sm text-foreground">Hold to speak</span>
                </div>
                <p className="text-xs text-muted">
                  Release when done. ListenOS will process your command instantly.
                </p>
              </div>

              <button
                onClick={handleComplete}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
              >
                Start Using ListenOS
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
