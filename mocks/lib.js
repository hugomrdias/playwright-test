/* eslint-disable */

import delay from 'delay'

export const good = async () => {
    await delay(100)
    return 'good'
}

export const bad = async () => {
    await delay(100)
    return 'bad'
}
