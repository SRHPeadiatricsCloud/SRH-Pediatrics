import type { Clinical } from "@/lib/clinical";

export type Detail = {
  baby: {
    id: number;
    uhid: string;
    babyName: string;
    motherName: string;
    bed: string;
    sex: string;
    dob: string;
    gestWeeks: number;
    gestDays: number;
    birthWeight: number;
    currentWeight: number;
    birthLength: number;
    birthHc: number;
    deliveryMode: string;
    apgar1: number;
    apgar5: number;
    bloodGroup: string;
    motherBloodGroup: string;
    inborn: boolean;
    acuity: string;
    status: string;
    isolation: string;
    consultant: string;
    unit: string;
    subspecialty: string;
    insurance: string;
    insuranceName: string;
    clinical: Clinical;
    updatedAt: string;
  };
  problems: {
    id: number;
    system: string;
    label: string;
    status: string;
    onsetAt: string;
    resolvedAt: string | null;
    detail?: string;
  }[];
  vitals: Record<string, number | string | null>[];
  events: { id: number; kind: string; text: string; author: string; at: string }[];
  tasks: {
    id: number;
    text: string;
    priority: string;
    done: boolean;
    doneAt: string | null;
    doneBy: string;
  }[];
  handovers: {
    id: number;
    shift: string;
    fromStaff: string;
    toStaff: string;
    illness: string;
    summary: string;
    actions: (string | Record<string, unknown>)[];
    contingency: string[];
    synthesis: string;
    acknowledgedBy: string;
    createdAt: string;
  }[];
};
