// The 2026 and 2027 dojo calendars, taken from the printed PDFs (emptyhands.student: assets/docs/).
// Used until a coach publishes that year's calendar from the coach panel, and as the
// starting point the coach panel loads for it.

const md = (list, type, year = 2026) => Object.fromEntries(list.map(d => [year + '-' + d, { type }]));
// Closed days with a reason: { 'MM-DD': 'reason' }.
const closedWith = (year, map) => Object.fromEntries(Object.entries(map).map(([d, note]) => [year + '-' + d, { type: 'closed', note }]));

export const DEFAULT_TIMINGS = [
  'ILFORD DOJO (every Thursday) — St Andrews Church Hall, The Drive, Ilford IG1',
  'Tai Chi class: 6pm – 7pm',
  'Beginner / Intermediate Karate: 7pm – 8pm',
  'Advanced Karate: 8pm – 9pm',
  'Yoga: 8pm – 9pm',
  'EPPING DOJO (invite only) — Jack Silley Pavilion, CM16 6SS',
  'Black Belt classes: 6:30pm – 8:30pm',
  'Sunday workshops: 12:30pm – 4pm',
];

export const CALENDAR_2026 = {
  year: 2026,
  timings: DEFAULT_TIMINGS,
  pdf: 'https://app.emptyhands.co.uk/assets/docs/EmptyHands-Dojo-Calendar-2026.pdf',
  days: {
    ...md(['01-08', '01-15', '01-22', '01-29', '02-05', '02-12', '02-19', '02-26', '03-05', '03-26',
      '04-09', '04-16', '04-23', '05-14', '05-21', '06-04', '06-11', '06-18', '06-25', '07-02',
      '07-09', '07-16', '07-23', '07-30', '08-13', '09-03', '09-10', '09-17', '09-24', '10-01',
      '10-08', '10-15', '10-22', '10-29', '11-05', '11-12', '11-19', '11-26', '12-03', '12-10'], 'training'),
    ...md(['01-01', '03-12', '03-19', '04-02', '05-07', '05-28', '08-20', '08-27', '12-17', '12-24', '12-31'], 'closed'),
    ...closedWith(2026, { '04-03': 'Good Friday', '04-06': 'Easter Monday', '05-04': 'Early May bank holiday', '05-25': 'Spring bank holiday',
      '08-31': 'Summer bank holiday', '12-25': 'Christmas Day', '12-28': 'Boxing Day (bank holiday)' }),
    ...md(['02-08', '04-26', '07-05', '08-02', '09-06', '10-04', '11-15'], 'blackbelt'),
    ...md(['04-30', '08-06', '11-28'], 'grading'),
  },
};

export const CALENDAR_2027 = {
  year: 2027,
  timings: DEFAULT_TIMINGS,
  pdf: 'https://app.emptyhands.co.uk/assets/docs/EmptyHands-Dojo-Calendar-2027.pdf',
  days: {
    ...md(['01-07', '01-14', '01-21', '01-28', '02-04', '02-11', '02-18', '03-11', '03-18', '04-01',
      '04-08', '04-15', '04-22', '05-06', '05-13', '05-20', '05-27', '06-03', '06-10', '06-17',
      '06-24', '07-01', '07-08', '07-15', '07-22', '07-29', '08-12', '09-02', '09-09', '09-16',
      '09-23', '09-30', '10-07', '10-14', '10-21', '10-28', '11-04', '11-11', '11-18', '11-25',
      '12-02', '12-09'], 'training', 2027),
    ...closedWith(2027, {
      '01-01': 'New Year', '01-02': 'New Year', '01-03': 'New Year',
      '02-25': 'Ramadan (last two weeks)', '03-04': 'Ramadan (last two weeks)',
      '03-25': 'Easter', '03-26': 'Good Friday', '03-29': 'Easter Monday',
      '05-03': 'Early May bank holiday', '05-31': 'Spring bank holiday',
      '08-19': 'Summer break', '08-26': 'Summer break', '08-30': 'Summer bank holiday',
      '12-16': 'Christmas break', '12-23': 'Christmas break', '12-25': 'Christmas Day', '12-26': 'Boxing Day',
      '12-27': 'Christmas Day (bank holiday)', '12-28': 'Boxing Day (bank holiday)', '12-30': 'Christmas break',
    }),
    ...md(['02-07', '04-25', '07-04', '08-01', '09-05', '10-03', '11-14'], 'blackbelt', 2027),
    ...md(['04-29', '08-05', '11-27'], 'grading', 2027),
  },
};
