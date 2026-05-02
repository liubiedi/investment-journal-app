module.exports = {
  requestCalendarPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getCalendarsAsync: jest.fn().mockResolvedValue([{ id: "1", allowsModifications: true }]),
  createEventAsync: jest.fn().mockResolvedValue("event-id"),
  EntityTypes: { EVENT: "event" },
};
