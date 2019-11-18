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
    }
    // init loads the dictionary and builds the tokenizer.
    init = _ => {
        kuromoji
            .builder({
                dicPath: "https://kuromojin.netlify.com/dict/",
            })
            .build((err, tokenizer) => {
                this.tokenizer = tokenizer
                window.tokenizer = tokenizer
                this.process()
            })
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
                        /[0-9]|[a-z]|[A-Z]|[-!$%^&*()_+|~=`{}\[\]:";'<>?,.\/]|[ ]|[「」『』、。：？；]/
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
    }
}

const yomu = new Yomu().init()
