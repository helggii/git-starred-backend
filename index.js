import express from 'express';
import fetch from 'node-fetch';
import prisma_client from '@prisma/client';
const { PrismaClient } = prisma_client;

const app = express();

const client_id = process.env.GITHUB_CLIENT_ID;
const client_secret = process.env.GITHUB_CLIENT_SECRET;

const prisma = new PrismaClient();
let curr_user;

async function main() {
	app.get('/login', (_req, res) => {
		console.log('attempt to login');
		const redirect_uri = 'http://localhost:4000/api/auth/callback';
		res.send(
			`https://github.com/login/oauth/authorize?client_id=${process.env
				.GITHUB_CLIENT_ID}&redirect_uri=${redirect_uri}`
		);
	});

	async function getAccessToken({ code, client_id, client_secret }) {
		const request = await fetch(
			'https://github.com/login/oauth/access_token',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					client_id,
					client_secret,
					code
				})
			}
		);

		const text = await request.text();
		const params = new URLSearchParams(text);

		console.log(params);

		return params.get('access_token');
	}

	async function fetchGitHubUser(token) {
		const request = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: 'token ' + token
			}
		});

		return await request.json();
	}

	async function fetchUserStarred(curr_user) {
		let User;
		try {
			User = await prisma.user.findUnique({
				where: {
					id: curr_user
				}
			});
		} catch (err) {
			return -1;
		}

		const request = await fetch(
			`https://api.github.com/users/${User.name}/starred`,
			{
				headers: {
					Authorization: 'token ' + User.accessToken
				}
			}
		);
		return request.json();
	}

	async function fetchLoggedUser(curr_user) {
		let User;

		try {
			User = await prisma.user.findUnique({
				where: {
					id: curr_user
				}
			});
		} catch (err) {
			return -1;
		}

		console.log(User);

		return User;
	}

	app.get('/api/auth/callback', async (req, res) => {
		res.redirect('http://localhost:3000/starred');
		const code = req.query.code;
		console.log(`Da code: ${code}`);

		const access_token = await getAccessToken({
			code,
			client_id,
			client_secret
		});

		const github_user = await fetchGitHubUser(access_token);
		//logic to find if the user is already in the database
		curr_user = github_user.id;

		const User = await prisma.user.findUnique({
			where: {
				id: curr_user
			}
		});

		if (User != null) {
			console.log('Found the user in the database, updating credentials');

			const updatedUser = await prisma.user.update({
				where: {
					id: curr_user
				},
				data: {
					id: github_user.id,
					name: github_user.login,
					image: github_user.avatar_url,
					createdAt: github_user.created_at,
					updatedAt: github_user.updated_at,
					accessToken: access_token
				}
			});
		} else {
			console.log(
				'Did not found the user in the database, creating user'
			);
			const User = await prisma.user.create({
				data: {
					id: github_user.id,
					name: github_user.login,
					image: github_user.avatar_url,
					createdAt: github_user.created_at,
					updatedAt: github_user.updated_at,
					accessToken: access_token
				}
			});
		}
	});

	app.get('/user', async (req, res) => {
		const user = await fetchLoggedUser(curr_user);
		if (user === -1) res.sendStatus(404);
		else res.send(user);
	});

	app.get('/starred', async (req, res) => {
		const starred = await fetchUserStarred(curr_user);

		if (starred === -1) {
			res.sendStatus(404);
		} else {
			starred.forEach(async function(repo, _) {
				const Repo = await prisma.starred.findUnique({
					where: {
						repoId: repo.id
					}
				});

				if (Repo != null) {
					console.log(
						'Found the repo in the database, updating database'
					);

					const updatedRepo = await prisma.starred.update({
						where: {
							repoId: repo.id
						},
						data: {
							repoName: repo.full_name,
							ownerId: repo.owner.id,
							ownerImage: repo.owner.avatar_url,
							stargazers: repo.stargazers_count,
							stargazerId: curr_user,
							language: repo.language
						}
					});
				} else {
					console.log(
						'Did not found the repo in the database, adding it'
					);
					const addedRepo = await prisma.starred.create({
						data: {
							repoId: repo.id,
							repoName: repo.full_name,
							ownerId: repo.owner.id,
							ownerImage: repo.owner.avatar_url,
							stargazers: repo.stargazers_count,
							stargazerId: curr_user,
							language: repo.language
						}
					});
				}
			});
			const Repos = await prisma.starred.findMany({
				where: {
					stargazerId: curr_user
				}
			});

			res.send(Repos);
		}
	});

	app.get('/logout', (_req, res) => {
		res.redirect('https:localhost:3000/login');
		curr_user = '';
	});

	const PORT = process.env.PORT || 4000;
	app.listen(PORT, () =>
		console.log(
			`Listening on localhost:${PORT} , login on http://localhost:${PORT}/login`
		)
	);
}
main();
