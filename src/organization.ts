export const DRAWING_CATALOG_VERSION = 2 as const;
export const GROUP_ACTIONS = [
  "group.create",
  "group.rename",
  "group.members",
  "group.visibility",
  "group.lock",
  "group.remove",
] as const;
export const GROUP_MEMBERS_MIN = 2;
export const GROUP_MEMBERS_LIMIT = 100;
export type DrawingGroupOperation =
  | { action: "group.create"; name: string; ids: string[] }
  | { action: "group.rename"; id: string; name: string }
  | { action: "group.members"; id: string; add?: string[]; remove?: string[] }
  | { action: "group.visibility"; id: string; visible: boolean }
  | {
      action: "group.lock";
      id: string;
      locked: boolean;
      confirmUserIntent: true;
    }
  | { action: "group.remove"; id: string };
export function isDrawingGroupOperation(value: {
  action: string;
}): value is DrawingGroupOperation {
  return GROUP_ACTIONS.includes(
    value.action as DrawingGroupOperation["action"],
  );
}
export interface DrawingGroupSummary {
  id: string;
  name: string;
  shapeIds: string[];
  memberCount: number;
  membersTruncated: boolean;
  visibility: "visible" | "hidden" | "partial";
  locked: boolean;
  editable: boolean;
}
