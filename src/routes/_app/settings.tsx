import { createFileRoute } from "@tanstack/react-router";
import { SettingsPanel } from "@/components/settings-panel";

export const Route = createFileRoute("/_app/settings")({ component: () => <SettingsPanel /> });
