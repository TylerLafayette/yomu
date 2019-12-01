// 読む worker
// made by Tyler Lafayette
// (with the help of some awesome open-source projects)

// Yomu will load the dictionary files as well as make requests for
// dictionary entries from this API URL.
const API_URL = "https://yomu-api.herokuapp.com"

// Action constants.
const TOKENIZE = "TOKENIZE"
const TOKENIZE_COMPLETED = "TOKENIZE_COMPLETED"
const DICTIONARY_LOOKUP = "DICTIONARY_LOOKUP"
const DICTIONARY_LOOKUP_COMPLETED = "DICTIONARY_LOOKUP_COMPLETED"
const DICTIONARY_LOOKUP_ERROR = "DICTIONARY_LOOKUP_ERROR"

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
    // messagePipe receives and interprets messages from the inject script.
    messagePipe = (request, sender, sendResponse) => {
        const { action } = request

        switch (action) {
            case TOKENIZE:
                this.tokenizeMessage(request)
                break
            case DICTIONARY_LOOKUP:
                this.dictionaryLookup(request)
                break
            default:
                break
        }
    }
    // tokenizeMessage takes a message from the inject script, tokenizes
    // it, then replies with the tokens.
    tokenizeMessage = ({ elementId, content }) => {
        // Tokenize the received content.
        const tokenized = this.tokenizer.tokenize(content)
        // Send a message back to the inject script with the tokens.
        this.sendMessage({
            action: TOKENIZE_COMPLETED,
            elementId,
            tokenized,
        })
    }
    // dictionaryLookup looks up a word on the dictionary, then replies to
    // the inject script with it.
    dictionaryLookup = async ({ requestId, word }) => {
        try {
            const request = await fetch(`${API_URL}/dictionary?keyword=${word}`)
            const json = await request.json()
            this.sendMessage({
                action: DICTIONARY_LOOKUP_COMPLETED,
                requestId,
                json,
            })
        } catch (e) {
            this.sendMessage({
                action: DICTIONARY_LOOKUP_ERROR,
                requestId,
            })
        }
    }
    // sendMessage sends a message to the active tab.
    sendMessage = message => {
        // Get the active Chrome tab.
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            // Send a message to the found tab.
            chrome.tabs.sendMessage(tabs[0].id, message)
        })
    }
}

// Initialize the YomuWorker.
const worker = new YomuWorker()
// Attach the Chrome message listener to the YomuWorker's messagePipe.
chrome.runtime.onMessage.addListener(worker.messagePipe)
// Initialize the YomuWorker.
worker.init()
