export type BookingSearch = {
  destination: string;
  origin: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  rooms: number;
};

export type BookingOption = {
  label: string;
  description: string;
  href: string;
};

export function getBookingOptions(search: BookingSearch): BookingOption[] {
  const destination = search.destination.trim();
  const origin = search.origin?.trim() || null;
  const datePhrase =
    search.startDate && search.endDate
      ? ` from ${search.startDate} to ${search.endDate}`
      : search.startDate
        ? ` from ${search.startDate}`
        : "";
  const adults =
    Number.isInteger(search.travelers) && search.travelers > 0 ? Math.min(search.travelers, 20) : 1;
  const rooms = Number.isInteger(search.rooms) && search.rooms > 0 ? Math.min(search.rooms, 20) : 1;

  const bookingUrl = new URL("https://www.booking.com/searchresults.html");
  bookingUrl.searchParams.set("ss", destination);
  bookingUrl.searchParams.set("group_adults", String(adults));
  bookingUrl.searchParams.set("no_rooms", String(rooms));
  bookingUrl.searchParams.set("group_children", "0");
  bookingUrl.searchParams.set("selected_currency", "INR");
  if (search.startDate && search.endDate) {
    bookingUrl.searchParams.set("checkin", search.startDate);
    bookingUrl.searchParams.set("checkout", search.endDate);
  }

  const hotelQuery = new URLSearchParams({
    q: `hotels in ${destination}${datePhrase} for ${adults} guests`,
  });
  const flightQuery = new URLSearchParams({
    q: `flights${origin ? ` from ${origin}` : ""} to ${destination}${datePhrase} for ${adults} travelers`,
  });

  return [
    {
      label: "Booking.com",
      description: "Compare stays and check room availability",
      href: bookingUrl.toString(),
    },
    {
      label: "Google Hotels",
      description: "Explore more stays and hotel providers",
      href: `https://www.google.com/travel/search?${hotelQuery.toString()}`,
    },
    {
      label: "Google Flights",
      description: "Search flights for your route and dates",
      href: `https://www.google.com/travel/flights?${flightQuery.toString()}`,
    },
    {
      label: "IRCTC trains",
      description: "Book train tickets on the official Indian Railways portal",
      href: "https://www.irctc.co.in/nget/train-search",
    },
    {
      label: "redBus",
      description: "Search and book intercity bus tickets",
      href: "https://www.redbus.in/",
    },
  ];
}

export function getCheckoutDate(startDate: string, nights: number): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !Number.isInteger(nights) ||
    nights < 1 ||
    nights > 30
  ) {
    return null;
  }
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + nights);
  const checkoutDate = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(checkoutDate) ? checkoutDate : null;
}
