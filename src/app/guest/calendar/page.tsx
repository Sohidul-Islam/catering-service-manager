import { MealCalendar } from "@/components/calendar/MealCalendar";

export default function GuestCalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Meal Calendar</h2>
        <p className="text-sm text-slate-500">
          Click any working day to turn lunch ON/OFF, adjust quantities, or submit a late adjustment request if locked.
        </p>
      </div>
      <MealCalendar mode="GUEST" />
    </div>
  );
}
