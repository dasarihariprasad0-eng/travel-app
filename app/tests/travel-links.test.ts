import { describe, expect, it } from "vitest";
import { getBookingOptions, getCheckoutDate } from "../src/lib/travel-links";

describe("travel booking links", () => {
  it("builds hotel and flight links with trip search details", () => {
    const options = getBookingOptions({
      destination: "Leh, Ladakh",
      origin: "Pune",
      startDate: "2026-10-20",
      endDate: "2026-10-24",
      travelers: 4,
      rooms: 2,
    });
    const booking = new URL(options[0]!.href);
    const flights = new URL(options[2]!.href);

    expect(booking.origin).toBe("https://www.booking.com");
    expect(booking.searchParams.get("ss")).toBe("Leh, Ladakh");
    expect(booking.searchParams.get("checkin")).toBe("2026-10-20");
    expect(booking.searchParams.get("checkout")).toBe("2026-10-24");
    expect(booking.searchParams.get("group_adults")).toBe("4");
    expect(booking.searchParams.get("no_rooms")).toBe("2");
    expect(flights.searchParams.get("q")).toContain("from Pune to Leh, Ladakh");
    expect(flights.searchParams.get("q")).toContain("2026-10-24");
  });

  it("offers train and bus providers even without a home city or dates", () => {
    const options = getBookingOptions({
      destination: "Goa",
      origin: null,
      startDate: null,
      endDate: null,
      travelers: 0,
      rooms: 0,
    });

    expect(options.map(({ label }) => label)).toEqual([
      "Booking.com",
      "Google Hotels",
      "Google Flights",
      "IRCTC trains",
      "redBus",
    ]);
    expect(options[3]!.href).toBe("https://www.irctc.co.in/nget/train-search");
    expect(options[4]!.href).toBe("https://www.redbus.in/");
    expect(new URL(options[0]!.href).searchParams.get("group_adults")).toBe("1");
    expect(new URL(options[0]!.href).searchParams.has("checkin")).toBe(false);
  });

  it("derives a valid checkout date from the selected trip start and duration", () => {
    expect(getCheckoutDate("2026-10-20", 4)).toBe("2026-10-24");
    expect(getCheckoutDate("2026-02-27", 3)).toBe("2026-03-02");
    expect(getCheckoutDate("2026-02-30", 2)).toBeNull();
    expect(getCheckoutDate("2026-10-20", 0)).toBeNull();
    expect(getCheckoutDate("2026-10-20", 31)).toBeNull();
  });
});
