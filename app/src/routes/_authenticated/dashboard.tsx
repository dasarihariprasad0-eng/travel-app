      </td>
      <td>
        <span
          className={`crystal-status${isComplete ? " is-complete" : isActive ? " is-active" : ""}`}
        >
          <i />
          {capitalize(trip.status)}
        </span>
      </td>
      <td>
        <Link
          to="/trips"
          search={{ trip: trip.id }}
          className="crystal-row-link"
          aria-label={`Open ${trip.title}`}
        >
          <ArrowUpRight size={16} />
        </Link>
      </td>
    </tr>
  );
}

function TripChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="crystal-tooltip">
      <span>{label}</span>
      <strong>
        {payload[0].value} {payload[0].value === 1 ? "trip" : "trips"}
      </strong>
    </div>
  );
}

function getTripStats(trips: TripCard[]) {
  const destinations = new Set(
    trips.map((trip) => trip.destination.trim().toLocaleLowerCase()).filter(Boolean),
  );
  return {
    tripCount: trips.length,
    upcomingCount: trips.filter((trip) => {
      const status = trip.status.toLowerCase();
      return (
        new Date(`${trip.start_date}T00:00:00`).getTime() >= startOfToday() &&
        status !== "completed" &&
        status !== "cancelled"
      );
    }).length,
    travelerCount: trips.reduce((total, trip) => total + trip.memberCount, 0),
    destinationCount: destinations.size,
  };
}

function getChartData(trips: TripCard[]) {
  const now = new Date();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const tripMonths = trips
    .map((trip) => new Date(`${trip.start_date}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getFullYear() * 12 + date.getMonth());
  const firstMonth = Math.min(currentMonth - 5, ...tripMonths);
  const lastMonth = Math.max(currentMonth + 1, ...tripMonths);
  const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => {
    const monthIndex = firstMonth + index;
    const date = new Date(Math.floor(monthIndex / 12), monthIndex % 12, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(date),
      trips: 0,
    };
  });

  for (const trip of trips) {
    const date = new Date(`${trip.start_date}T00:00:00`);
    const month = months.find(
      (entry) =>
        entry.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
    if (month) month.trips += 1;
  }
  return months;
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const sameMonth =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();
  const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  const startLabel = dateFormatter.format(startDate);
  if (sameMonth) {
    return `${startLabel}–${endDate.getDate()}, ${endDate.getFullYear()}`;
  }
  const endLabel = dateFormatter.format(endDate);
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  return startYear === endYear
    ? `${startLabel} – ${endLabel}, ${endYear}`
    : `${startLabel}, ${startYear} – ${endLabel}, ${endYear}`;
}

function formatToday() {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(
    new Date(),
  );
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function capitalize(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}
