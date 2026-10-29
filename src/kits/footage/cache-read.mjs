/** Filesystem failures at this private cache boundary always include the repair, never decoder detail. */
export function cacheRead(read){try{return read();}catch(error){if(error?.code)throw new Error('A media cache file is missing, changed or unreadable; remove this cache and prepare the recording again.');throw error;}}
