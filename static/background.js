chrome.browserAction.onClicked.addListener((tab) => {
  // No tabs or host permissions needed!
  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log(`Turning ${tab.url} red!`)
  chrome.tabs.executeScript({
    code: 'document.body.style.backgroundColor="red"',
  })
})
