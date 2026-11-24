import { MealCalendar } from "@/components/calendar/MealCalendar";

export default function AdminCalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Organization Meal Calendar</h2>
        <p className="text-sm text-slate-500">
          Click any date to inspect guest breakdowns or override meal quantities.
        </p>
      </div>
      <MealCalendar mode="ADMIN" />
    </div>
  );
}
