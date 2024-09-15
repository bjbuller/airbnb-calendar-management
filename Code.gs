const CHECK_OUT_TIME = '10:00', CHECK_OUT_TITLE = '🔄';
const CHECK_IN_TIME = '14:00', CHECK_IN_TITLE = '✅';
const todaysDate = new Date()
todaysDate.setUTCHours(0, 0, 0, 0);
todaysDate.setDate(todaysDate.getDate() - 3); // Add as a buffer to include a few days prior to today.
const futureDate = new Date();
futureDate.setFullYear(todaysDate.getFullYear() + 1);
const reservationEventKeywords = ["Reserved"]; // Any events that are all day including these terms will be treated as a reservation and assume a check in and check out event is needed.
const LOG = true; // Set this to `false` if you want to turn off logging


function manageCheckEventsAndSyncReservations() {
  const calendarIds = []; // An array of calendarIds
  calendarIds.forEach(calendarId => {
    const allEvents = fetchCalendarEvents(calendarId);
    debugLog(calendarId)
    debugLog(allEvents.length)
    const allActiveEvents = allEvents.filter(event => event.status != 'cancelled'), allActiveEventIds = allActiveEvents.map(event => event.id);
    allEvents.forEach(event => {
      Logger.log(`${event.summary} ${JSON.stringify(event)}`)
      if (isReservationEvent(event) && isAtLeastToday(event.start.dateTime || event.start.date)) {
        debugLog(event.summary, event.start)
        handleCheckInOutEvent(event, calendarId, allActiveEventIds);
      } else {
        handleOrphanEvent(event, calendarId, allActiveEventIds);
      }
    });
  })

  function handleOrphanEvent(event, calendarId, allActiveEventIds) {
    const reservationId = event.extendedProperties?.private?.van_reservationId
    if (!reservationId) { return; } // This event is not tied to a Reservation event. Leave it alone.
    if (allActiveEventIds.includes(reservationId)) {
      revervationCheckInId = Calendar.Events.get(calendarId, reservationId).extendedProperties?.private?.van_checkInEventId;
      revervationCheckOutId = Calendar.Events.get(calendarId, reservationId).extendedProperties?.private?.van_checkOutEventId;
      if (revervationCheckInId == event.id || revervationCheckOutId == event.id) {
        return;
      } // The event is tied to an active Reservation event. Leave it alone.
    }
    event.status = 'cancelled';
    Calendar.Events.update(event, calendarId, event.id);
    Calendar.Events.remove(calendarId, event.id)
  }




  function handleCheckInOutEvent(reservationEvent, calendarId, allActiveEventIds) {
    debugLog([`----------Handling check-in/out events for reservation event: ${reservationEvent.summary}`]);

    // Extract check-in and check-out event IDs
    let checkInEventId = reservationEvent.extendedProperties?.private?.van_checkInEventId;
    let checkOutEventId = reservationEvent.extendedProperties?.private?.van_checkOutEventId;
    let checkInEventIsActive = allActiveEventIds.includes(checkInEventId);
    let checkOutEventIsActive = allActiveEventIds.includes(checkOutEventId);

    // If both check-in and check-out events are already active, exit early
    if (checkInEventIsActive && checkOutEventIsActive) { return; }

    reservationEvent.extendedProperties = reservationEvent.extendedProperties || {};
    reservationEvent.extendedProperties.private = reservationEvent.extendedProperties.private || {};

    if (!checkInEventId || !checkInEventIsActive) {
      const checkInEvent = createNewCheckEvent(calendarId, reservationEvent, 'check-in');
      reservationEvent.extendedProperties.private.van_checkInEventId = checkInEvent?.id;
    }

    if (!checkOutEventId || !checkOutEventIsActive) {
      const checkOutEvent = createNewCheckEvent(calendarId, reservationEvent, 'check-out');
      reservationEvent.extendedProperties.private.van_checkOutEventId = checkOutEvent?.id;
    }
    debugLog([`INITIAL: ${JSON.stringify(Calendar.Events.get(calendarId, reservationEvent.id).extendedProperties.private)}`]);

    Calendar.Events.update(reservationEvent, calendarId, reservationEvent.id);
    debugLog([`Reservation Event Updated with check in/out IDs`]);
    debugLog([`FINAL: ${JSON.stringify(Calendar.Events.get(calendarId, reservationEvent.id).extendedProperties.private)}`]);
  }


  function createNewCheckEvent(calendarId, reservationEvent, eventType) {
    if (eventType == 'check-in') {
      var summary = CHECK_IN_TITLE, time = CHECK_IN_TIME, date = new Date(reservationEvent.start.dateTime || reservationEvent.start.date);
    } else if (eventType == 'check-out') {
      var summary = CHECK_OUT_TITLE, time = CHECK_OUT_TIME, date = new Date(reservationEvent.end.dateTime || reservationEvent.end.date);
    }
    var [hour, minute] = time.split(':').map(Number);
    var checkDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0);
    var checkEndTime = checkDate; // 0 duration so that airbnb does not block off that day.


    debugLog([`Creating new ${eventType} event for reservation: ${reservationEvent.summary} ${reservationEvent.start}`]);
    console.log([`Creating new ${eventType} event for reservation: ${reservationEvent.summary}`]);

    const event = {
      summary: summary,
      description: reservationEvent.description,
      start: { dateTime: checkDate.toISOString() },
      end: { dateTime: checkEndTime.toISOString() },
      extendedProperties: {
        private: {
          van_reservationId: reservationEvent.id,
          van_reservationStart: reservationEvent.start?.dateTime || reservationEvent.start.date,
          van_reservationEnd: reservationEvent.end?.dateTime || reservationEvent.end.date,
          van_eventType: eventType
        }
      }
    };

    try {
      const createdEvent = Calendar.Events.insert(event, calendarId);
      debugLog([`Successfully created new ${eventType} event with ID: ${createdEvent.id}`]);
      return createdEvent;
    } catch (error) {
      debugLog([`Error creating new ${eventType} event: ${error.message}`]);
      return null;
    }
  }

}


function debugLog(details) {
  if (LOG) {
    if (!(details instanceof Array)) { details = [details]; }
    details.forEach(detail => Logger.log(detail));
  }
}

function fetchCalendarEvents(calendarId) {
  const response = Calendar.Events.list(calendarId, {
    timeMin: todaysDate.toISOString(),
    timeMax: futureDate.toISOString(),
    singleEvents: true,
    maxResults: 250,
    showDeleted: false
  });
  return response.items || [];
}

function isReservationEvent(event) {
  if (event.start.dateTime) { return false; }
  return reservationEventKeywords.some(str => event.summary.includes(str));
}

function isAtLeastToday(date) {
  const eventDateObj = new Date(date);
  const today = new Date();
  return eventDateObj >= new Date(today.getFullYear(), today.getMonth(), today.getDate());
}
