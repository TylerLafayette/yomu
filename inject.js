const _XHROpen = window.XMLHttpRequest.prototype.open

// Quick and dirty fix for a weird issue with kuromoji.js where it treats
// the URL like a path.
window.XMLHttpRequest.prototype.open = function(a, b, c) {
    if (b.includes('https:/kuromojin')) {
        arguments[1] = arguments[1].replace(
            'https:/kuromojin',
            'https://kuromojin'
        )
    }
    return _XHROpen.apply(this, arguments)
}

class Yomu {
    searchTags = ['p']
    constructor() {
        this.tokenizer = null
    }
    // init loads the dictionary and builds the tokenizer.
    init = _ => {
        kuromoji
            .builder({
                dicPath: 'https://kuromojin.netlify.com/dict/',
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
            const tokenized = this.tokenizer.tokenize(item.innerHTML)
            let content = item.innerHTML
            tokenized.forEach(token => {
                if (token.word_type !== 'KNOWN') return
                content = content.replace(
                    new RegExp(token.surface_form, 'g'),
                    `<a class="yomu-highlighted-word" href="#">${token.surface_form}</a>`
                )
            })

            item.innerHTML = content
        })
    }
}

const yomu = new Yomu().init()
