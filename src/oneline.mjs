// oneline — a row of a reply is one line, whatever the film's own files put in it.
//
// The rule is footprint-story's (its root door), so a deck and a film keep it alike: a line break, a control character,
// a mark that turns the reading direction and a character that draws nothing are shown as their escape, never obeyed;
// an error is said on one line, or on the rows its tool wrote itself (`error.rows`). Every row a reply lists passes
// through oneLine before the rows are joined, and every error through errorText where it is printed.
export {oneLine, isOneLine, errorText} from 'footprint-story';
