export function getCurrentDateTime() {
    const now = new Date();
  
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  
    return {
      date: formatter.format(now),
      timezone: "Asia/Tokyo",
    };
  }