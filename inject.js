const _XHROpen = window.XMLHttpRequest.prototype.open

// Quick and dirty fix for a weird issue with kuromoji.js where it treats
// the URL like a path.
window.XMLHttpRequest.prototype.open = function(a, b, c) {
    if (b.includes("https:/kuromojin")) {
        arguments[1] = arguments[1].replace(
            "https:/kuromojin",
            "https://kuromojin"
        )
    }
    return _XHROpen.apply(this, arguments)
}

class Yomu {
    searchTags = [
        ...new Array(6).fill().map((_, i) => `h${i + 1}`),
        "span",
        "p",
    ]
    constructor() {
        this.tokenizer = null
        this.mount = document.createElement("yomu-mount")
    }
    // init loads the dictionary and builds the tokenizer.
    init = async _ => {
        kuromoji
            .builder({
                dicPath: "https://kuromojin.netlify.com/dict/",
            })
            .build((err, tokenizer) => {
                this.tokenizer = tokenizer
                window.tokenizer = tokenizer
                this.process()
            })

        document.body.prepend(this.mount)
    }
    // attachListeners attaches listeners to the highlighted words in the DOM.
    attachListeners = _ => {
        document
            .querySelectorAll("yomu-highlighted-word")
            .forEach(item =>
                item.addEventListener("click", this.highlightClick)
            )
    }
    // highlightClick opens a prompt when a highlighted word is clicked.
    highlightClick = async e => {
        this.mount.innerHTML = ""
        e.target.classList.add("thinking")

        const word = e.target.innerHTML

        const request = await fetch(
            `https://cors-anywhere.herokuapp.com/https://jisho.org/api/v1/search/words?keyword=${word}`,
            {
                method: "GET",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    Origin: location.origin,
                    "X-Requested-With": "XMLHttpRequest",
                },
            }
        )

        const json = await request.json()

        if (!json.data) return e.target.classList.remove("thinking")

        if (!json.data[0]) return e.target.classList.remove("thinking")

        const vocab = json.data[0]
        const japanese = vocab.japanese[0]
        const senses = vocab.senses[0]

        const element = document.createElement("yomu-dictionary-box")

        element.innerHTML += `<span class="yomu-dictionary-reading">${
            japanese.reading
        }</span><span class="yomu-dictionary-title">${
            japanese.word
        }</span><p class="definitions">${senses.english_definitions.join(
            ", "
        )}</p>`

        const bound = e.target.getBoundingClientRect()

        element.style.bottom =
            window.innerHeight -
            (bound.y - this.mount.getBoundingClientRect().y) +
            "px"
        element.style.left = bound.x + "px"

        this.mount.append(element)
        e.target.classList.remove("thinking")
    }
    // process looks through the current tab and attempts to process text.
    process = async _ => {
        this.searchTags.forEach(this.processTag)
    }
    // processTag processes a single tag.
    processTag = tag => {
        document.querySelectorAll(tag).forEach(item => {
            let tokenized = this.tokenizer.tokenize(item.innerHTML)
            let content = item.innerHTML

            // Split the content into an array of every character to allow for injection later.
            let split = content.split("")

            // Filter out the bad stuff.
            tokenized = tokenized.filter(
                token =>
                    !token.surface_form.match(
                        /[0-9]|[a-z]|[A-Z]|[@#-•!$%^&*()_+|~=`{}\[\]:";'<>?,.\/]|[ ]|[「」『』、。：？；]/
                    )
            )

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
            item.innerHTML = split.join("")
        })

        // Attach new listeners to highlighted words.
        this.attachListeners()
    }
}

const yomu = new Yomu().init()
