import type { ReactNode } from "react";
import { PlanHeader, type PlanStep } from "./PlanHeader";

type Props = {
  title: string;
  step: PlanStep;
  reached: PlanStep;
  onStep: (step: PlanStep) => void;
  saved: boolean;
  children: ReactNode;
};

/** The full-screen frame of the planning flow: header on top, the step below. */
export function PlanShell({ children, ...header }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PlanHeader {...header} />
      {children}
    </div>
  );
}
