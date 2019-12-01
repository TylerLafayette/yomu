// 読む injector (content script)
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

const _XHROpen = window.XMLHttpRequest.prototype.open

// Quick and dirty fix for a weird issue with kuromoji.js where it treats
// the URL like a path.
window.XMLHttpRequest.prototype.open = function(a, b, c) {
    if (b.includes(API_URL.replace("//", "/"))) {
        // If it detects that 'https:/' is used, it will replace it
        // with 'https://'
        arguments[1] = arguments[1].replace(API_URL.replace("//", "/"), API_URL)
    }
    return _XHROpen.apply(this, arguments)
}

const getInnerDepth = node => {
    return node.childNodes.length - node.children.length
}

window.getInnerDepth = getInnerDepth

class Yomu {
    openWords = []
    searchTags = [
        ...new Array(6).fill().map((_, i) => `h${i + 1}`),
        "span",
        "p",
        "div*",
    ]
    blockedTags = ["html", "body", "script", "object"]
    tokenizeQueue = {}
    dictionaryQueue = {}
    constructor() {
        // The yomu-mount is where all dictionary-boxes are appended to
        // when displayed.
        this.mount = document.createElement("yomu-mount")
    }
    // init loads the dictionary and builds the tokenizer.
    init = async _ => {
        this.process()

        // Add the yomu-mount to the end of the body.
        document.body.prepend(this.mount)
    }
    // messagePipe receives and interprets messages from the yomu worker.
    messagePipe = (request, sender, sendResponse) => {
        // Get the action from the request.
        // In this model, the request functions similarly to a Redux
        // action and the action attribute signals what type of action to
        // dispatch.
        const { action } = request

        console.log(action)

        switch (action) {
            case TOKENIZE_COMPLETED:
                this.applyElement(request.elementId, request.tokenized)
                break
            case DICTIONARY_LOOKUP_COMPLETED:
                this.createDictionaryPopup(request.requestId, request.json)
                break
            case DICTIONARY_LOOKUP_ERROR:
                this.dictionaryError(request.requestId)
                break
            default:
                break
        }
    }
    // sendMessage sends a message to the yomu worker.
    sendMessage = message => {
        chrome.runtime.sendMessage(message)
    }
    // attachListeners attaches listeners to the highlighted words in the DOM.
    attachListeners = _ => {
        // Find all yomu-highlighted-words and attach them to the
        // highlightClick function.
        document
            .querySelectorAll("yomu-highlighted-word")
            .forEach(item =>
                item.addEventListener("click", this.highlightClick)
            )
    }
    // clearMount clears all the elements inside the mount.
    clearMount = _ => {
        // For every child of the mount, trigger the disappearing
        // transition and remove it.
        Array.from(this.mount.children).forEach(this.disappear)
        // Reset the open words.
        this.openWords = []
    }
    // disappear makes a dictionary box transition out.
    disappear = target => {
        // Add the transition class to the element.
        target.classList.add("transition-out")
        // After 300ms (transition duration) remove the target.
        setTimeout(() => this.mount.removeChild(target), 300)
    }
    // failed highlights a word that failed.
    failed = target => {
        target.classList.remove("thinking")
        target.classList.add("error")
    }
    // highlightClick opens a prompt when a highlighted word is clicked.
    highlightClick = async e => {
        // Get the word from the innerHTML of the element.
        const word = e.target.innerHTML
        // If the word is the currently open word, just clear the mount
        // (close the dictionary box) and return.
        if (this.openWords.includes(word)) return this.clearMount()

        // Clear it anyway.
        this.clearMount()

        // Add the thinking class to the element to indicate to the client
        // that the definition is loading.
        e.target.classList.add("thinking")
        // Remove the error class in case it was previously set.
        e.target.classList.remove("error")

        // Generate a pseudo-random ID for the request using the element's
        // height plus a random number.
        const requestId =
            e.target.clientHeight + Math.floor(Math.random() * 1000000000000)

        // Add an object to the dictionary queue for this item.
        this.dictionaryQueue[requestId] = {
            item: e.target,
            word,
        }

        // Send the request to the worker.
        this.sendMessage({
            action: DICTIONARY_LOOKUP,
            requestId,
            word,
        })
    }
    // createDictionaryPopup appends a dictionary-box to the mount based on
    // a response received from the worker.
    createDictionaryPopup = (requestId, json) => {
        // Get the item and word requested from the dictionary queue.
        const { item, word } = this.dictionaryQueue[requestId]

        // Throw an error to the client if anything went wrong.
        if (!json.data) return this.failed(item)
        if (!json.data[0]) return this.failed(item)

        const vocab = json.data[0]
        const japanese = vocab.japanese[0]
        const senses = vocab.senses[0]

        // Create a new yomu-dictionary-box element to display the
        // definition to the user.
        const element = document.createElement("yomu-dictionary-box")

        // Add the information to the innerHTML of the dictionary-box.
        element.innerHTML += `<span class="yomu-dictionary-reading">${japanese.reading ||
            japanese.word}</span><span class="yomu-dictionary-title">${japanese.word ||
            japanese.reading}</span><p class="definitions">${senses.english_definitions.join(
            ", "
        )}</p>`

        // Get the position of the clicked text in order to make
        // calculations on where to show the dictionary-box.
        const bound = item.getBoundingClientRect()

        element.style.bottom =
            window.innerHeight -
            (bound.y - this.mount.getBoundingClientRect().y) +
            "px"
        element.style.left = bound.x + "px"

        // Append the element and add it to the openWords array.
        this.mount.append(element)
        this.openWords.push(word)

        // Reset the loading state.
        item.classList.remove("thinking")

        // Clear the queue item.
        delete this.dictionaryQueue[requestId]
    }
    // dictionaryError shows an error on a failed dictionary lookup.
    dictionaryError = ({ requestId }) => {
        // Get the item from the dictionary queue.
        const { item } = this.dictionaryQueue[requestId]
        // Show the failed indicator.
        this.failed(item)

        // Clear the queue item.
        delete this.dictionaryQueue[requestId]
    }
    // process looks through the current tab and attempts to process text.
    process = async _ => {
        this.searchTags
            .map(x => [x.replace("*", ""), x.includes("*")])
            .forEach(this.processTag)
    }
    // processTag processes a single tag.
    processTag = async ([tag, dangerous]) => {
        document
            .querySelectorAll(tag)
            .forEach(item => this.processElement(item, dangerous))
    }
    // processElement processes a single element for tokenization.
    processElement = async (item, dangerous) => {
        if (Array.from(item.children).filter(x => x.tagName != "BR").length > 0)
            if (dangerous) return null
            else
                Array.from(item.children)
                    .filter(x => x.tagName != "BR")
                    .forEach(item => this.processElement(item, dangerous))

        if (this.blockedTags.includes(item.tagName.toLowerCase())) return

        let content = item.innerHTML

        // If the element is dangerous (eg: div) then make sure it has
        // no children. (can lead to weird lag/errors)
        if (dangerous && getInnerDepth(item) > 1) return

        // Generate a pseudo-random ID for the element using the element's
        // height plus a random number.
        const elementId =
            item.clientHeight + Math.floor(Math.random() * 1000000000000)

        // Add an object to the token queue for this item.
        this.tokenizeQueue[elementId] = {
            item,
            content,
        }

        // Send the TOKENIZE request to the worker.
        this.sendMessage({
            action: TOKENIZE,
            elementId,
            content: content.replace(/[<](.){1,}(>)(<\/)(.){1,}(>)/g, match =>
                "*".repeat(match.length)
            ),
        })
    }
    // applyElement applies highlights to an element after its content has
    // been tokenized.
    applyElement = async (elementId, tokenized) => {
        // Get the item from the tokenize queue.
        if (!this.tokenizeQueue[elementId]) return
        let { item, content } = this.tokenizeQueue[elementId]

        if (!item || !content) return

        // Filter out the bad stuff. (Non-Japanese characters, etc.)
        tokenized = tokenized.filter(
            token =>
                !token.surface_form.match(
                    /[0-9]|[a-z]|[A-Z]|[@#-•!$%^&*()_+|~=`{}\[\]:";'<>?,.\/]|[ ]|[「」『』、。：？；]/
                )
        )

        // Split the content into an array of every character to allow for injection later.
        let split = content.split("")

        // For each token, add the yomu-highlighted-word element around the word.
        tokenized.forEach(token => {
            split[
                token.word_position - 1
            ] = `<yomu-highlighted-word class="yomu-highlighted-word">${
                split[token.word_position - 1]
            }`

            split[token.word_position - 2 + token.surface_form.length] = `${
                split[token.word_position - 2 + token.surface_form.length]
            }</yomu-highlighted-word>`
        })

        // Join the array again and replace the inner content of the tag with it.
        if (split.join("") != item.innerHTML) item.innerHTML = split.join("")

        // Re-attach new listeners.
        this.attachListeners()

        // Delete the item from the queue.
        delete this.tokenizeQueue[elementId]
    }
}

// Initialize the Yomu class.
const yomu = new Yomu()
// Attach the Chrome message listener to the Yomu message pipe.
chrome.runtime.onMessage.addListener(yomu.messagePipe)
// Initialize Yomu.
yomu.init()
