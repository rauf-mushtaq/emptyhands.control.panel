// The 2026 dojo calendar, taken from the printed PDF (emptyhands.student: assets/docs/).
// Used until a coach publishes the 2026 calendar from the coach panel, and as the
// starting point the coach panel loads for 2026.

const md = (list, type) => Object.fromEntries(list.map(d => ['2026-' + d, { type }]));

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
  pdf: 'https://rauf-mushtaq.github.io/emptyhands.student/assets/docs/EmptyHands-Dojo-Calendar-2026.pdf',
  days: {
    ...md(['01-08', '01-15', '01-22', '01-29', '02-05', '02-12', '02-19', '02-26', '03-05', '03-26',
      '04-09', '04-16', '04-23', '05-14', '05-21', '06-04', '06-11', '06-18', '06-25', '07-02',
      '07-09', '07-16', '07-23', '07-30', '08-13', '09-03', '09-10', '09-17', '09-24', '10-01',
      '10-08', '10-15', '10-22', '10-29', '11-05', '11-12', '11-19', '11-26', '12-03', '12-10'], 'training'),
    ...md(['01-01', '03-12', '03-19', '04-02', '05-07', '05-28', '08-20', '08-27', '12-17', '12-24', '12-31'], 'closed'),
    ...md(['02-08', '04-26', '07-05', '08-02', '09-06', '10-04', '11-15'], 'blackbelt'),
    ...md(['04-30', '08-06', '11-28'], 'grading'),
  },
};
