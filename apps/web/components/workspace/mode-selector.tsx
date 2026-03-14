"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  ClipboardList,
  Hammer,
  Wand2,
  Bug,
} from "lucide-react";

const modes = [
  { value: "Discuss", icon: MessageSquare, color: "text-blue-500" },
  { value: "Plan", icon: ClipboardList, color: "text-amber-500" },
  { value: "Build", icon: Hammer, color: "text-green-500" },
  { value: "Improve", icon: Wand2, color: "text-purple-500" },
  { value: "Debug", icon: Bug, color: "text-red-500" },
];

interface ModeSelectorProps {
  mode: string;
  onModeChange: (mode: string) => void;
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  const current = modes.find((m) => m.value === mode) || modes[0];
  const Icon = current.icon;

  return (
    <Select value={mode} onValueChange={onModeChange}>
      <SelectTrigger
        data-testid="select-mode"
        className="w-[140px] h-8 text-sm"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${current.color}`} />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {modes.map((m) => (
          <SelectItem
            key={m.value}
            value={m.value}
            data-testid={`option-mode-${m.value.toLowerCase()}`}
          >
            <div className="flex items-center gap-2">
              <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
              {m.value}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
