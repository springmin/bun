declare module "astro:actions" {
	type Actions = typeof import("/storage/Users/currentUser/springsources/bun/test/js/third_party/astro/fixtures/src/actions")["server"];

	export const actions: Actions;
}