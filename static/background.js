/* eslint-disable no-console */
/* eslint-disable no-undef */
/* eslint-disable strict */
chrome.browserAction.onClicked.addListener((tab) => {
  // No tabs or host permissions needed!
  console.log('Turning ' + tab.url + ' red!')
  chrome.tabs.executeScript({
    code: 'document.body.style.backgroundColor="red"',
  })
})
