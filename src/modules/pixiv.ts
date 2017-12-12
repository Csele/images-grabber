import co from "co";
import { Question } from "inquirer";
import * as flattenDeep from "lodash.flattendeep";
import { extname } from "path";
import * as PixivApi from "pixiv-app-api";
import * as pixivImg from "pixiv-img";

import { wait } from "../util/functions";
import { QuestionTypes, IService, IServiceSearch } from "./serviceTemplate";

class PixivSearch extends IServiceSearch {
    public authorID: string;
    private pixivApi: PixivApi;

    constructor(public data: string, options: any) {
        super(data, options);
        this.pixivApi = new PixivApi();
        this.authorID = pixiv.regExpLink.exec(this.resource)[1];
        this.service = pixiv.serviceName;
    }

    /**
     * Login into pixiv
     * @returns {Promise<boolean>}
     */
    public async login(): Promise<boolean> {
        const {pixivUsername, pixivPassword} = this.options;
        try {
            await this.pixivApi.login(pixivUsername, pixivPassword);
            return true;
        } catch (e) {
            this.events.emit("error", `Pixiv login errored. Trying to continue as guest.`);
            this.pixivApi = new PixivApi();
            return false;
        }
    }

    /**
     * Gets links of images from author page
     * @returns {Promise<string[]>}
     */
    public async getImages(): Promise<string[]> {
        const auth = await this.login();
        if (!auth) {
            this.events.emit("error", `Pixiv account credentials need! Register, or write valid credentials!`);
            return [];
        }
        this.events.emit("successLogin", {
            password: this.options.pixivPassword,
            username: this.options.pixivUsername,
        });
        const posts = await Promise.all([
            co(this.getWorks("illust")),
            co(this.getWorks("manga")),
        ]);

        this.images = flattenDeep(flattenDeep(posts).map((el) => this.getIllustrUrls(el, this.options.all)));
        return this.images;
    }

    /**
     * Downloads image from pixiv url
     * @param {string} url
     * @param {number} index
     * @returns {Promise<void>}
     */
    public async downloadImage(url: string, index: number): Promise<void> {
        const file = `${this.filepath}/${index}${extname(url)}`;
        try {
            await pixivImg(url, file);
        } catch (e) {
            this.events.emit("error", `Image (${url}) downloading error: ${e}`);
        }
        await wait();

        this.events.emit("imageDownloaded", index);
    }

    /**
     * Gets all posts by type from author profile pages
     * @param {string} type
     * @returns {IterableIterator<string[]>}
     */
    private * getWorks(type: string): IterableIterator<string[]> {
        let json;
        try {
            json = yield this.pixivApi.userIllusts(this.authorID, {type});
        } catch (e) {
            this.events.emit("error", `Pixiv request error: ${e}`);
            json = {illusts: []};
        }
        let results = json.illusts.slice();
        this.events.emit("findImages", results.length);

        while (this.pixivApi.hasNext()) {
            json = yield this.pixivApi.next();
            results = results.concat(json.illusts);
            this.events.emit("findImages", results.length);
        }
        this.events.emit("findImages", results.length);

        return results;
    }

    /**
     * Gets URLs from post
     * @param el Author post object
     * @param {boolean} all Downlod ll of images? (multipage post)
     * @returns {string[]}
     */
    private getIllustrUrls(el, all: boolean): string[] {
        if (el.metaPages && el.metaPages.length > 0) {
            return all ?
                [].concat.apply(el.metaPages.map((img) => img.imageUrls.original || img.imageUrls.large)) :
                [el.metaPages[0].imageUrls.original];
        }
        return [el.metaSinglePage.originalImageUrl];
    }
}

const pixiv: IService = {
    questions:
        [
            {
                // tslint:disable-next-line max-line-length
                message: `Enter link to user whose pictures you want to grab (like https://www.pixiv.net/member_illust.php?id=6996493):`,
                name: "link",
                type: QuestionTypes.input,
                validate: (value) => {
                    if (value.length && pixiv.validateLink(value)) {
                        return true;
                    }
                    return "Please enter valid link";
                },
                when: (answers) =>
                    answers.type === pixiv.serviceName && !answers.link,
            } as Question,
            {
                message: "Do you want to grab pictures in \"collections\"?",
                name: "all",
                type: QuestionTypes.confirm,
                when: (answers) =>
                    answers.type === pixiv.serviceName,
            } as Question,
            {
                message: (answers) => (`Do you want to login as ${answers.pixivUsername}?`),
                name: "pixivLoginAs",
                type: QuestionTypes.confirm,
                when: (answers) =>
                    answers.type === pixiv.serviceName && answers.pixivUsername && answers.pixivPassword,
            } as Question,
            {
                message: "Enter your pixiv username:",
                name: "pixivUsername",
                type: QuestionTypes.input,
                when: (answers) =>
                    answers.type === pixiv.serviceName && (!answers.pixivUsername || !answers.pixivLoginAs),
            } as Question,
            {
                message: "Enter your pixiv password:",
                name: "pixivPassword",
                type: QuestionTypes.password,
                when: (answers) =>
                    answers.type === pixiv.serviceName && (!answers.pixivPassword || !answers.pixivLoginAs),
            } as Question,
        ],
    regExpLink: new RegExp(/(?:(?:http|https)(?::\/\/))?(?:www.)?(?:pixiv.net\/member(?:|_illust).php\?id=)?(\d{1,})/i),
    search: (link: string, options: any) => new PixivSearch(link, options),
    serviceLink: "https://pixiv.net",
    serviceName: "pixiv",
    validateLink: (link) => pixiv.regExpLink.test(link),
};

export { pixiv as default, PixivSearch as search };
