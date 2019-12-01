// 読む worker
// made by Tyler Lafayette
// (with the help of some awesome open-source projects)

// Yomu will load the dictionary files as well as make requests for
// dictionary entries from this API URL.
const API_URL = "https://yomu-api.herokuapp.com"

class YomuWorker {
    tokenizer = null
    constructor() {}
    // init initializes the tokenizer and starts the worker.
    init = _ => {
        kuromoji
            .builder({
                dicPath: `${API_URL}/public/vendor/dict/`,
            })
            .build((err, tokenizer) => {
                this.tokenizer = tokenizer
            })
    }
    // messagePipe receives and interprets messages from the content script.
    messagePipe = (request, sender, sendResponse) => {
        alert(`Received ${request.greeting}`)
        this.sendMessage({ farewell: "hhhh" })
    }
    // sendMessage sends a message to the active tab.
    sendMessage = message => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            chrome.tabs.sendMessage(tabs[0].id, message)
        })
    }
}

const worker = new YomuWorker()
chrome.runtime.onMessage.addListener(worker.messagePipe)
