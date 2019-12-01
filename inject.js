// 読む injector (content script)
// made by Tyler Lafayette
// (with the help of some awesome open-source projects)

// Yomu will load the dictionary files as well as make requests for
// dictionary entries from this API URL.
const API_URL = "https://yomu-api.herokuapp.com"

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
    ]
    blockedTags = ["html", "body", "script", "object"]
    tokenizeQueue = []
    constructor() {
        this.tokenizer = null
        this.mount = document.createElement("yomu-mount")
    }
    // init loads the dictionary and builds the tokenizer.
    init = async _ => {
        kuromoji
            .builder({
                dicPath: `${API_URL}/public/vendor/dict/`,
            })
            .build((err, tokenizer) => {
                this.tokenizer = tokenizer
                window.tokenizer = tokenizer
                this.process()
            })

        document.body.prepend(this.mount)
        this.sendMessage({ greeting: "je" })
    }
    // messagePipe receives and interprets messages from the yomu worker.
    messagePipe = (request, sender, sendResponse) => {
        alert(`Received ${request.farewell}`)
    }
    // sendMessage sends a message to the yomu worker.
    sendMessage = message => {
        chrome.runtime.sendMessage(message)
    }
    // attachListeners attaches listeners to the highlighted words in the DOM.
    attachListeners = _ => {
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

        e.target.classList.add("thinking")
        e.target.classList.remove("error")

        const request = await fetch(`${API_URL}/dictionary?keyword=${word}`, {
            method: "GET",
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                Origin: location.origin,
                "X-Requested-With": "XMLHttpRequest",
            },
        })

        const json = await request.json()

        if (!json.data) return this.failed(e.target)

        if (!json.data[0]) return this.failed(e.target)

        const vocab = json.data[0]
        const japanese = vocab.japanese[0]
        const senses = vocab.senses[0]

        const element = document.createElement("yomu-dictionary-box")

        element.innerHTML += `<span class="yomu-dictionary-reading">${
            japanese.reading
        }</span><span class="yomu-dictionary-title">${japanese.word ||
            japanese.reading}</span><p class="definitions">${senses.english_definitions.join(
            ", "
        )}</p>`

        const bound = e.target.getBoundingClientRect()

        element.style.bottom =
            window.innerHeight -
            (bound.y - this.mount.getBoundingClientRect().y) +
            "px"
        element.style.left = bound.x + "px"

        this.mount.append(element)
        this.openWords.push(word)
        e.target.classList.remove("thinking")
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

        // Attach new listeners to highlighted words.
        this.attachListeners()
    }
    processElement = async (item, dangerous) => {
        if (item.children.length > 0)
            if (dangerous) return null
            else
                Array.from(item.children).forEach(item =>
                    this.processElement(item, dangerous)
                )

        if (this.blockedTags.includes(item.tagName.toLowerCase())) return

        let content = item.innerHTML

        // If the element is dangerous (eg: div) then make sure it has
        // no children. (can lead to weird lag/errors)
        if (dangerous && getInnerDepth(item) > 1) return

        // Generate a pseudo-random ID for the element using the element's
        // height plus a random number.
        const elementId =
            item.clientHeight + Math.floor(Math.random() * 1000000000000)

        this.sendMessage({
            action: "TOKENIZE",
            elementId,
            content: content.replace(/[<](.){1,}(>)(<\/)(.){1,}(>)/g, match =>
                "*".repeat(match.length)
            ),
        })

        let tokenized = this.tokenizer.tokenize(
            content.replace(/[<](.){1,}(>)(<\/)(.){1,}(>)/g, match =>
                "*".repeat(match.length)
            )
        )

        // Filter out the bad stuff.
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
    }
}

const yomu = new Yomu()
chrome.runtime.onMessage.addListener(yomu.messagePipe)
yomu.init()
