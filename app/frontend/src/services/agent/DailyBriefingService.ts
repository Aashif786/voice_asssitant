import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import { ToolRegistry } from "@/src/services/tools/ToolRegistry";
import { MemoryRepository } from "@/src/services/storage/MemoryRepository";

export const DailyBriefingService = {
  async generateBriefing(userName: string = ""): Promise<string> {
    const now = new Date();
    const hour = now.getHours();
    const greeting =
      hour < 12
        ? `Good morning${userName ? `, ${userName}` : ""}!`
        : hour < 17
        ? `Good afternoon${userName ? `, ${userName}` : ""}!`
        : `Good evening${userName ? `, ${userName}` : ""}!`;

    const dateStr = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    // 1. Agenda
    let agendaSummary = "No scheduled appointments for today.";
    try {
      const calRes = await ToolRegistry.get("read_calendar").execute({ range: "today" });
      if (calRes && calRes.message) {
        agendaSummary = calRes.message;
      }
    } catch {}

    // 2. Battery status
    let batterySummary = "";
    try {
      const bat = await AndroidAssistant.getBatteryStatus();
      if (bat.success) {
        batterySummary = `Your battery is at ${bat.percentage}% and currently ${bat.isCharging ? "charging" : "discharging"}.`;
      }
    } catch {}

    // 3. User memories / priorities
    let memorySnippet = "";
    try {
      const memories = await MemoryRepository.listMemories();
      if (memories.length > 0) {
        const topMem = memories[0];
        memorySnippet = `Remember: ${topMem.subject} ${topMem.predicate} ${topMem.object}.`;
      }
    } catch {}

    // 4. Recent notifications
    let notifSnippet = "";
    try {
      if (await AndroidAssistant.hasNotificationAccess()) {
        const notifs = await AndroidAssistant.getRecentNotifications(5);
        if (notifs.length > 0) {
          notifSnippet = `You have ${notifs.length} recent notification${notifs.length > 1 ? "s" : ""}.`;
        }
      }
    } catch {}

    const parts = [
      greeting,
      `It's ${timeStr} on ${dateStr}.`,
      batterySummary,
      agendaSummary,
      notifSnippet,
      memorySnippet,
      "Have a productive day!",
    ].filter(Boolean);

    return parts.join("\n\n");
  },
};

export default DailyBriefingService;
