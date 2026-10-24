import { ExternalLink } from "lucide-react";
import { getBookingOptions } from "@/lib/travel-links";

type BookingOptionsProps = {
  destination: string;
  origin: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  rooms: number;
};

export function BookingOptions({
  destination,
  origin,
  startDate,
  endDate,
  travelers,
  rooms,
}: BookingOptionsProps) {
  const options = getBookingOptions({
    destination,
    origin,
    startDate,
    endDate,
    travelers,
    rooms,
  });

  return (
    <section className="other-plans-panel" aria-label={`Booking options for ${destination}`}>
      <div className="other-plans-heading">
        <div>
          <p className="eyebrow">OTHER PLANS</p>
          <h3>Find and book your travel</h3>
        </div>
        <span>Opens provider sites</span>
      </div>
      <p className="other-plans-note">
        Compare options and complete your booking directly with the provider. Prices and
        availability are set by each provider.
      </p>
      <div className="other-plans-grid">
        {options.map((option) => (
          <a
            className="other-plan-link"
            href={option.href}
            key={option.label}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        ))}
      </div>
      {origin ? (
        <p className="other-plans-route">
          Route: {origin} → {destination}
          {startDate && endDate ? ` · ${startDate} – ${endDate}` : ""}
        </p>
      ) : (
        <p className="other-plans-route">
          Add your home city in travel preferences to personalize flight searches.
        </p>
      )}
    </section>
  );
}
